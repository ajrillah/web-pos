import {
  type ImportCommitResponse,
  type ImportPreviewResponse,
  importRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { currentActor, requireApproval } from '../auth/session';
import type { ServiceContext } from '../services/context';
import { buildImportTemplate } from '../services/import-file';
import { commitImport, previewImport } from '../services/product-import-service';

/** The file travels base64-encoded in JSON (5 MB file limit). */
const IMPORT_BODY_LIMIT = 8 * 1024 * 1024;

/** Impor barang: owner PIN menu (`impor`) for cashiers; owners open it directly. */
export const productImportRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (
  app,
  { ctx },
) => {
  app.addHook('preHandler', requireApproval(ctx.approvals, 'impor'));

  app.get('/products/import/template', async (_request, reply) =>
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="Template-Impor-Barang.xlsx"')
      .send(await buildImportTemplate()),
  );

  app.post(
    '/products/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request): Promise<ImportPreviewResponse> =>
      previewImport(ctx, importRequestSchema.parse(request.body)),
  );

  app.post(
    '/products/import',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply): Promise<ImportCommitResponse> => {
      const result = await commitImport(
        ctx,
        currentActor(request),
        importRequestSchema.parse(request.body),
      );
      reply.status(201);
      return result;
    },
  );
};
