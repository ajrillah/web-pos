import {
  type ChangePinResponse,
  changePinRequestSchema,
  loginRequestSchema,
  type MeResponse,
  type RecoveryCodeResponse,
  recoverRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { clearSessionCookie, currentUser, requireUser, setSessionCookie } from '../auth/session';
import { changeOwnPin, login, logout, recoverPin } from '../services/auth-service';
import type { ServiceContext } from '../services/context';
import { toUser } from '../services/user-mapper';

export const authRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.post('/auth/login', async (request, reply): Promise<MeResponse> => {
    const input = loginRequestSchema.parse(request.body);
    const { user, token } = await login(ctx, input);
    setSessionCookie(reply, token);
    return { user };
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.auth) {
      logout(ctx, request.auth.sessionId);
    }
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get(
    '/auth/me',
    { preHandler: requireUser, config: { allowPendingPinChange: true } },
    async (request): Promise<MeResponse> => ({ user: toUser(currentUser(request)) }),
  );

  app.put(
    '/auth/me/pin',
    { preHandler: requireUser, config: { allowPendingPinChange: true } },
    async (request): Promise<ChangePinResponse> => {
      const input = changePinRequestSchema.parse(request.body);
      return changeOwnPin(ctx, currentUser(request).id, input);
    },
  );

  app.post('/auth/recover', async (request): Promise<RecoveryCodeResponse> => {
    const input = recoverRequestSchema.parse(request.body);
    return recoverPin(ctx, input);
  });
};
