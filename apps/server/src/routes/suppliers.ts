import {
  type CostSuggestionResponse,
  costSuggestionQuerySchema,
  createPurchaseRequestSchema,
  createSupplierPaymentRequestSchema,
  createSupplierRequestSchema,
  type PayablesResponse,
  type PurchaseResponse,
  type PurchasesResponse,
  payablesQuerySchema,
  purchasesQuerySchema,
  type SupplierLedgerResponse,
  type SupplierPaymentResponse,
  type SupplierResponse,
  type SuppliersResponse,
  suppliersQuerySchema,
  supplierVoidRequestSchema,
  updateSupplierRequestSchema,
  type VoidPurchaseResponse,
  voidReasonText,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  approvalFor,
  currentActor,
  currentUser,
  requireApproval,
  requireUser,
} from '../auth/session';
import type { ServiceContext } from '../services/context';
import {
  costSuggestion,
  createPurchase,
  createSupplierPayment,
  getPurchase,
  getSupplierPayment,
  searchPurchases,
  voidPurchase,
  voidSupplierPayment,
} from '../services/purchase-service';
import {
  createSupplier,
  getSupplier,
  listPayables,
  searchSuppliers,
  supplierLedger,
  updateSupplierById,
} from '../services/supplier-service';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Suppliers, purchases (Stok Masuk), payables, and supplier payments. Voids need owner PIN. */
export const supplierRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireUser);

  app.get(
    '/suppliers',
    async (request): Promise<SuppliersResponse> =>
      searchSuppliers(ctx, suppliersQuerySchema.parse(request.query)),
  );

  app.get('/suppliers/:id', async (request): Promise<SupplierResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { supplier: getSupplier(ctx, id) };
  });

  app.get('/suppliers/:id/ledger', async (request): Promise<SupplierLedgerResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return supplierLedger(ctx, id);
  });

  app.post('/suppliers', async (request, reply): Promise<SupplierResponse> => {
    const input = createSupplierRequestSchema.parse(request.body);
    const supplier = createSupplier(ctx, currentUser(request), input);
    reply.status(201);
    return { supplier };
  });

  app.put('/suppliers/:id', async (request): Promise<SupplierResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const input = updateSupplierRequestSchema.parse(request.body);
    return { supplier: updateSupplierById(ctx, currentUser(request), id, input) };
  });

  app.get(
    '/payables',
    async (request): Promise<PayablesResponse> =>
      listPayables(ctx, payablesQuerySchema.parse(request.query)),
  );

  app.get(
    '/purchases',
    async (request): Promise<PurchasesResponse> =>
      searchPurchases(ctx, purchasesQuerySchema.parse(request.query)),
  );

  app.get('/purchases/cost-suggestion', async (request): Promise<CostSuggestionResponse> => {
    const { productId } = costSuggestionQuerySchema.parse(request.query);
    return costSuggestion(ctx, productId);
  });

  app.get('/purchases/:id', async (request): Promise<PurchaseResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { purchase: getPurchase(ctx, id) };
  });

  app.post('/purchases', async (request, reply): Promise<PurchaseResponse> => {
    const input = createPurchaseRequestSchema.parse(request.body);
    // Cost price changes need approval for cashiers; the service decides whether there are any.
    approvalFor(request, ctx.approvals, 'purchase.cost', input.id);
    const purchase = createPurchase(ctx, currentActor(request), input);
    reply.status(201);
    return { purchase };
  });

  app.post(
    '/purchases/:id/void',
    {
      preHandler: requireApproval(
        ctx.approvals,
        'purchase.void',
        (request) => idParamsSchema.parse(request.params).id,
      ),
    },
    async (request): Promise<VoidPurchaseResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const input = supplierVoidRequestSchema.parse(request.body ?? {});
      return voidPurchase(ctx, currentActor(request), id, voidReasonText(input));
    },
  );

  app.post('/supplier-payments', async (request, reply): Promise<SupplierPaymentResponse> => {
    const input = createSupplierPaymentRequestSchema.parse(request.body);
    const payment = createSupplierPayment(ctx, currentUser(request), input);
    reply.status(201);
    return { payment };
  });

  app.get('/supplier-payments/:id', async (request): Promise<SupplierPaymentResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { payment: getSupplierPayment(ctx, id) };
  });

  app.post(
    '/supplier-payments/:id/void',
    {
      preHandler: requireApproval(
        ctx.approvals,
        'supplier-payment.void',
        (request) => idParamsSchema.parse(request.params).id,
      ),
    },
    async (request): Promise<SupplierPaymentResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const input = supplierVoidRequestSchema.parse(request.body ?? {});
      return {
        payment: voidSupplierPayment(ctx, currentActor(request), id, voidReasonText(input)),
      };
    },
  );
};
