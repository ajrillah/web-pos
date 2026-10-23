import type { RestoreResponse } from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireOwner } from '../auth/session';
import { createBackup, prepareRestore, type SystemContext } from '../services/backup-service';
import type { ServiceContext } from '../services/context';

/** Restore uploads the backup zip as the raw request body. */
const RESTORE_BODY_LIMIT = 1024 * 1024 * 1024;

/** Cadangkan / Pulihkan Data: owners only (no approval token for cashiers). */
export const backupRoutes: FastifyPluginAsync<{
  ctx: ServiceContext;
  system: SystemContext;
}> = async (app, { ctx, system }) => {
  app.addHook('preHandler', requireOwner);
  app.addContentTypeParser(
    ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: RESTORE_BODY_LIMIT },
    (_request, body, done) => done(null, body),
  );

  app.get('/backup', async (_request, reply) => {
    const file = await createBackup(ctx, system);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${file.fileName}"`)
      .send(file.body);
  });

  app.post(
    '/restore',
    { bodyLimit: RESTORE_BODY_LIMIT },
    async (request, reply): Promise<RestoreResponse> => {
      const { apply } = await prepareRestore(ctx, system, request.body as Buffer);
      // Replace the files only after the response is out; the restart ends this process.
      reply.raw.once('finish', () => system.restart(apply));
      return { restarting: true };
    },
  );
};
