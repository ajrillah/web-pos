import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appErrors } from '../errors';
import type { UserRow } from '../repositories/users-repository';
import { type ResolvedSession, resolveSession } from '../services/auth-service';
import type { ServiceContext } from '../services/context';

export const SESSION_COOKIE = 'toko_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth: ResolvedSession | null;
  }
  interface FastifyContextConfig {
    /** Route stays reachable while the user must change their PIN. */
    allowPendingPinChange?: boolean;
  }
}

/** Registers cookie parsing and resolves `request.auth` from the session cookie on /api requests. */
export async function registerSession(app: FastifyInstance, ctx: ServiceContext): Promise<void> {
  await app.register(fastifyCookie);
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }
    const token = request.cookies[SESSION_COOKIE];
    request.auth = token ? resolveSession(ctx, token) : null;
  });
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  // No Max-Age: the server enforces the 12 h idle expiry. Plain HTTP on 127.0.0.1, so no Secure.
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** preHandler: requires a session; blocks most routes while a PIN change is pending. */
export async function requireUser(request: FastifyRequest): Promise<void> {
  const auth = request.auth;
  if (!auth) {
    throw appErrors.unauthenticated();
  }
  if (auth.user.mustChangePin && !request.routeOptions.config.allowPendingPinChange) {
    throw appErrors.pinChangeRequired();
  }
}

/**
 * preHandler for PIN endpoints. Owners pass directly; cashiers need an approval token,
 * which arrives in Stage 5 — until then they are refused.
 */
export async function requireOwner(request: FastifyRequest): Promise<void> {
  await requireUser(request);
  if (request.auth?.user.role !== 'owner') {
    throw appErrors.ownerApprovalRequired();
  }
}

/** The authenticated user; only call after requireUser/requireOwner. */
export function currentUser(request: FastifyRequest): UserRow {
  if (!request.auth) {
    throw appErrors.unauthenticated();
  }
  return request.auth.user;
}
