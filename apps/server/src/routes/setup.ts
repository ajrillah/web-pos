import {
  type RecoveryCodeResponse,
  type SetupStatusResponse,
  setupRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { setSessionCookie } from '../auth/session';
import { getSetupStatus, setup } from '../services/auth-service';
import type { ServiceContext } from '../services/context';

export const setupRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.get('/setup/status', async (): Promise<SetupStatusResponse> => getSetupStatus(ctx));

  app.post('/setup', async (request, reply): Promise<RecoveryCodeResponse> => {
    const input = setupRequestSchema.parse(request.body);
    const { token, ...result } = await setup(ctx, input);
    setSessionCookie(reply, token);
    reply.status(201);
    return result;
  });
};
