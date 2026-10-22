import { exportFormatSchema, reportTypeSchema } from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApproval } from '../auth/session';
import type { ServiceContext } from '../services/context';
import { exportReport } from '../services/report-export-service';
import { reportBuilders } from '../services/report-service';

const typeParamsSchema = z.object({ type: reportTypeSchema });
const queryObject = z.record(z.string(), z.unknown());

/** Laporan: owner PIN menu (`laporan`) for cashiers; owners open it directly. */
export const reportRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireApproval(ctx.approvals, 'laporan'));

  app.get('/reports/:type', async (request) => {
    const { type } = typeParamsSchema.parse(request.params);
    const query = queryObject.parse(request.query ?? {});
    return (reportBuilders[type] as (c: ServiceContext, q: unknown) => unknown)(ctx, query);
  });

  app.get('/reports/:type/export', async (request, reply) => {
    const { type } = typeParamsSchema.parse(request.params);
    const { format, ...query } = queryObject.parse(request.query ?? {});
    const file = await exportReport(ctx, type, exportFormatSchema.parse(format), query);
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.fileName}"`)
      .send(file.body);
  });
};
