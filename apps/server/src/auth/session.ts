import fastifyCookie from '@fastify/cookie';
import { APPROVAL_HEADER, type ApprovalScope } from '@toko-podomoro/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appErrors } from '../errors';
import type { UserRow } from '../repositories/users-repository';
import type { Approval, ApprovalStore } from '../security/approvals';
import { type ResolvedSession, resolveSession } from '../services/auth-service';
import type { Actor, ServiceContext } from '../services/context';

export const SESSION_COOKIE = 'toko_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth: ResolvedSession | null;
    /** Owner approval presented with this request (cashiers), spent if the request succeeds. */
    approval: Approval | null;
  }
  interface FastifyContextConfig {
    /** Route stays reachable while the user must change their PIN. */
    allowPendingPinChange?: boolean;
    /** Route stays reachable while the screen is locked. */
    allowLocked?: boolean;
  }
}

/** Registers cookie parsing and resolves `request.auth` from the session cookie on /api requests. */
export async function registerSession(app: FastifyInstance, ctx: ServiceContext): Promise<void> {
  await app.register(fastifyCookie);
  app.decorateRequest('auth', null);
  app.decorateRequest('approval', null);
  // Single-use action tokens are spent only when the approved request succeeded.
  app.addHook('onResponse', async (request, reply) => {
    if (request.approval && reply.statusCode < 400) {
      ctx.approvals.consume(request.approval.token);
    }
  });
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

/** preHandler: requires a session; blocks most routes while locked or a PIN change is pending. */
export async function requireUser(request: FastifyRequest): Promise<void> {
  const auth = request.auth;
  if (!auth) {
    throw appErrors.unauthenticated();
  }
  if (auth.locked && !request.routeOptions.config.allowLocked) {
    throw appErrors.sessionLocked();
  }
  if (auth.user.mustChangePin && !request.routeOptions.config.allowPendingPinChange) {
    throw appErrors.pinChangeRequired();
  }
}

/**
 * The owner approval sent in `X-Approval-Token` for this scope and target, if valid.
 * Owners need none. Sets `request.approval` so the token is spent when the request succeeds.
 */
export function approvalFor(
  request: FastifyRequest,
  approvals: ApprovalStore,
  scope: ApprovalScope,
  targetId: string | null = null,
): Approval | null {
  const auth = request.auth;
  if (!auth || auth.user.role === 'owner') return null;
  const header = request.headers[APPROVAL_HEADER];
  const approval = approvals.check(
    typeof header === 'string' ? header : undefined,
    auth.sessionId,
    scope,
    targetId,
  );
  request.approval = approval;
  return approval;
}

/**
 * preHandler for PIN endpoints: owners pass; cashiers need a valid approval token for `scope`
 * (and the target from the route params, for action scopes that have one).
 */
export function requireApproval(
  approvals: ApprovalStore,
  scope: ApprovalScope,
  target?: (request: FastifyRequest) => string,
) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireUser(request);
    if (request.auth?.user.role === 'owner') return;
    if (!approvalFor(request, approvals, scope, target ? target(request) : null)) {
      throw appErrors.ownerApprovalRequired();
    }
  };
}

/** preHandler for owner-only endpoints: no approval token can stand in for an owner session. */
export async function requireOwner(request: FastifyRequest): Promise<void> {
  await requireUser(request);
  if (request.auth?.user.role !== 'owner') {
    throw appErrors.ownerOnly();
  }
}

/** The acting user, with the approving owner when a cashier presented an approval. */
export function currentActor(request: FastifyRequest): Actor {
  const user = currentUser(request);
  return { id: user.id, role: user.role, approvedBy: request.approval?.ownerId ?? null };
}

/** The authenticated user; only call after requireUser/requireApproval. */
export function currentUser(request: FastifyRequest): UserRow {
  if (!request.auth) {
    throw appErrors.unauthenticated();
  }
  return request.auth.user;
}
