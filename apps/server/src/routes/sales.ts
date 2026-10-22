import {
  type CreateSaleResponse,
  createSaleRequestSchema,
  type DeletedCountResponse,
  deleteHeldSalesQuerySchema,
  type HeldSalesResponse,
  holdSaleRequestSchema,
  type ReceiptSavedResponse,
  type ResumeHeldSaleResponse,
  type SaleResponse,
  type SalesResponse,
  salesQuerySchema,
  voidRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentActor, currentUser, requireApproval, requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import {
  downloadReceipt,
  openReceipt,
  openReceiptFolder,
  saveReceipt,
} from '../services/receipt-service';
import {
  createSale,
  deleteHeldSale,
  deleteHeldSalesBefore,
  getSale,
  holdSale,
  listHeld,
  resumeHeldSale,
  searchSales,
  voidSale,
} from '../services/sale-service';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Sales, held sales, and receipts. Open to cashiers (voids arrive in Stage 5). */
export const saleRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireUser);

  app.post('/sales', async (request, reply): Promise<CreateSaleResponse> => {
    const input = createSaleRequestSchema.parse(request.body);
    const result = createSale(ctx, currentUser(request), input);
    reply.status(201);
    return result;
  });

  app.get(
    '/sales',
    async (request): Promise<SalesResponse> =>
      searchSales(ctx, salesQuerySchema.parse(request.query)),
  );

  app.get('/sales/held', async (): Promise<HeldSalesResponse> => ({ heldSales: listHeld(ctx) }));

  app.post('/sales/held', async (request, reply): Promise<SaleResponse> => {
    const input = holdSaleRequestSchema.parse(request.body);
    const sale = holdSale(ctx, currentUser(request), input);
    reply.status(201);
    return { sale };
  });

  app.post('/sales/held/:id/resume', async (request): Promise<ResumeHeldSaleResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return resumeHeldSale(ctx, id);
  });

  app.delete('/sales/held/:id', async (request): Promise<DeletedCountResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { deleted: deleteHeldSale(ctx, currentUser(request), id) };
  });

  app.delete('/sales/held', async (request): Promise<DeletedCountResponse> => {
    const { before } = deleteHeldSalesQuerySchema.parse(request.query);
    return { deleted: deleteHeldSalesBefore(ctx, currentUser(request), before) };
  });

  app.get('/sales/:id', async (request): Promise<SaleResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { sale: getSale(ctx, id) };
  });

  app.post(
    '/sales/:id/void',
    {
      preHandler: requireApproval(
        ctx.approvals,
        'sale.void',
        (request) => idParamsSchema.parse(request.params).id,
      ),
    },
    async (request): Promise<SaleResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const { reason } = voidRequestSchema.parse(request.body ?? {});
      return { sale: voidSale(ctx, currentActor(request), id, reason || null) };
    },
  );

  app.post('/sales/:id/receipt', async (request): Promise<ReceiptSavedResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return saveReceipt(ctx, 'sale', id);
  });

  app.post('/sales/:id/receipt/open', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    openReceipt(ctx, 'sale', id);
    return reply.status(204).send();
  });

  app.get('/sales/:id/receipt.pdf', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const { fileName, pdf } = await downloadReceipt(ctx, 'sale', id);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(pdf);
  });

  app.post('/receipts/open-folder', async (_request, reply) => {
    openReceiptFolder(ctx);
    return reply.status(204).send();
  });
};
