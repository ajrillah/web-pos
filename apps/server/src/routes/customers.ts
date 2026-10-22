import {
  type CustomerLedgerResponse,
  type CustomerPaymentResponse,
  type CustomerResponse,
  type CustomersResponse,
  createCustomerPaymentRequestSchema,
  createCustomerRequestSchema,
  customersQuerySchema,
  type ReceiptSavedResponse,
  type ReceivablesResponse,
  receivablesQuerySchema,
  updateCustomerRequestSchema,
  voidRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentActor, currentUser, requireApproval, requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import {
  createCustomer,
  customerLedger,
  getCustomer,
  listReceivables,
  searchCustomers,
  updateCustomerById,
} from '../services/customer-service';
import {
  createCustomerPayment,
  getPayment,
  voidCustomerPayment,
} from '../services/payment-service';
import { downloadReceipt, openReceipt, saveReceipt } from '../services/receipt-service';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Customers, kasbon, and customer payments. Open to cashiers (voids arrive in Stage 5). */
export const customerRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireUser);

  app.get(
    '/customers',
    async (request): Promise<CustomersResponse> =>
      searchCustomers(ctx, customersQuerySchema.parse(request.query)),
  );

  app.get('/customers/:id', async (request): Promise<CustomerResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { customer: getCustomer(ctx, id) };
  });

  app.get('/customers/:id/ledger', async (request): Promise<CustomerLedgerResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return customerLedger(ctx, id);
  });

  app.post('/customers', async (request, reply): Promise<CustomerResponse> => {
    const input = createCustomerRequestSchema.parse(request.body);
    const customer = createCustomer(ctx, currentUser(request), input);
    reply.status(201);
    return { customer };
  });

  app.put('/customers/:id', async (request): Promise<CustomerResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const input = updateCustomerRequestSchema.parse(request.body);
    return { customer: updateCustomerById(ctx, currentUser(request), id, input) };
  });

  app.get(
    '/receivables',
    async (request): Promise<ReceivablesResponse> =>
      listReceivables(ctx, receivablesQuerySchema.parse(request.query)),
  );

  app.post('/customer-payments', async (request, reply): Promise<CustomerPaymentResponse> => {
    const input = createCustomerPaymentRequestSchema.parse(request.body);
    const payment = createCustomerPayment(ctx, currentUser(request), input);
    reply.status(201);
    return { payment };
  });

  app.get('/customer-payments/:id', async (request): Promise<CustomerPaymentResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { payment: getPayment(ctx, id) };
  });

  app.post(
    '/customer-payments/:id/void',
    {
      preHandler: requireApproval(
        ctx.approvals,
        'payment.void',
        (request) => idParamsSchema.parse(request.params).id,
      ),
    },
    async (request): Promise<CustomerPaymentResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const { reason } = voidRequestSchema.parse(request.body ?? {});
      return { payment: voidCustomerPayment(ctx, currentActor(request), id, reason || null) };
    },
  );

  app.post('/customer-payments/:id/receipt', async (request): Promise<ReceiptSavedResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return saveReceipt(ctx, 'payment', id);
  });

  app.post('/customer-payments/:id/receipt/open', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    openReceipt(ctx, 'payment', id);
    return reply.status(204).send();
  });

  app.get('/customer-payments/:id/receipt.pdf', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const { fileName, pdf } = await downloadReceipt(ctx, 'payment', id);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(pdf);
  });
};
