import {
  type AdjustmentsResponse,
  adjustmentsQuerySchema,
  type CompleteOpnameResponse,
  type CreateAdjustmentResponse,
  createAdjustmentRequestSchema,
  type MovementsResponse,
  movementsQuerySchema,
  type OpnameResponse,
  type OpnamesResponse,
  opnamesQuerySchema,
  startOpnameRequestSchema,
  updateOpnameItemsRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentUser, requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import {
  cancelOpname,
  completeOpname,
  createAdjustment,
  getOpname,
  listAdjustments,
  listMovements,
  listOpnames,
  startOpname,
  updateOpnameItems,
} from '../services/stock-service';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Stock adjustments, opname sessions, and movement history. Open to cashiers. */
export const stockRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireUser);

  app.get(
    '/stock-adjustments',
    async (request): Promise<AdjustmentsResponse> =>
      listAdjustments(ctx, adjustmentsQuerySchema.parse(request.query)),
  );

  app.post('/stock-adjustments', async (request, reply): Promise<CreateAdjustmentResponse> => {
    const input = createAdjustmentRequestSchema.parse(request.body);
    const result = createAdjustment(ctx, currentUser(request), input);
    reply.status(201);
    return result;
  });

  app.get(
    '/stock-opname',
    async (request): Promise<OpnamesResponse> =>
      listOpnames(ctx, opnamesQuerySchema.parse(request.query)),
  );

  app.post('/stock-opname', async (request, reply): Promise<OpnameResponse> => {
    const { categoryId } = startOpnameRequestSchema.parse(request.body);
    const opname = startOpname(ctx, currentUser(request), categoryId);
    reply.status(201);
    return { opname };
  });

  app.get('/stock-opname/:id', async (request): Promise<OpnameResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { opname: getOpname(ctx, id) };
  });

  app.put('/stock-opname/:id/items', async (request): Promise<OpnameResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const input = updateOpnameItemsRequestSchema.parse(request.body);
    return { opname: updateOpnameItems(ctx, id, input) };
  });

  app.post('/stock-opname/:id/complete', async (request): Promise<CompleteOpnameResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return completeOpname(ctx, currentUser(request), id);
  });

  app.post('/stock-opname/:id/cancel', async (request): Promise<OpnameResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { opname: cancelOpname(ctx, currentUser(request), id) };
  });

  app.get(
    '/stock-movements',
    async (request): Promise<MovementsResponse> =>
      listMovements(ctx, movementsQuerySchema.parse(request.query)),
  );
};
