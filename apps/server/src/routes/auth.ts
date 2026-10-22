import {
  type ApproveResponse,
  approveRequestSchema,
  type ChangePinResponse,
  changePinRequestSchema,
  type LoginUsersResponse,
  loginRequestSchema,
  type MeResponse,
  type RecoveryCodeResponse,
  recoverRequestSchema,
  releaseApprovalRequestSchema,
  unlockRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { clearSessionCookie, currentUser, requireUser, setSessionCookie } from '../auth/session';
import { appErrors } from '../errors';
import {
  approve,
  changeOwnPin,
  listLoginUsers,
  lock,
  login,
  logout,
  recoverPin,
  unlock,
} from '../services/auth-service';
import type { ServiceContext } from '../services/context';
import { toUser } from '../services/user-mapper';

const session = (request: FastifyRequest) => {
  if (!request.auth) throw appErrors.unauthenticated();
  return request.auth;
};

export const authRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  /** Login tiles; no session needed. */
  app.get('/auth/users', async (): Promise<LoginUsersResponse> => ({ users: listLoginUsers(ctx) }));

  app.post('/auth/login', async (request, reply): Promise<MeResponse> => {
    const input = loginRequestSchema.parse(request.body);
    const { user, token } = await login(ctx, input);
    setSessionCookie(reply, token);
    return { user, locked: false };
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
    { preHandler: requireUser, config: { allowPendingPinChange: true, allowLocked: true } },
    async (request): Promise<MeResponse> => ({
      user: toUser(currentUser(request)),
      locked: session(request).locked,
    }),
  );

  app.post(
    '/auth/lock',
    { preHandler: requireUser, config: { allowLocked: true } },
    async (request, reply) => {
      lock(ctx, session(request).sessionId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/auth/unlock',
    { preHandler: requireUser, config: { allowLocked: true } },
    async (request): Promise<MeResponse> => {
      const { pin } = unlockRequestSchema.parse(request.body);
      await unlock(ctx, session(request), pin);
      return { user: toUser(currentUser(request)), locked: false };
    },
  );

  app.post(
    '/auth/approve',
    { preHandler: requireUser },
    async (request): Promise<ApproveResponse> => {
      const input = approveRequestSchema.parse(request.body);
      return approve(ctx, session(request), input);
    },
  );

  /** The cashier left a PIN menu: its menu approval ends. */
  app.post('/auth/approve/release', { preHandler: requireUser }, async (request, reply) => {
    const { token } = releaseApprovalRequestSchema.parse(request.body);
    ctx.approvals.release(token, session(request).sessionId);
    return reply.status(204).send();
  });

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
