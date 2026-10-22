import type {
  ApproveRequest,
  ApproveResponse,
  ChangePinRequest,
  ChangePinResponse,
  LoginRequest,
  LoginUser,
  RecoverRequest,
  RecoveryCodeResponse,
  SetupRequest,
  User,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import {
  expireSession,
  expireUserSessions,
  findLiveSessionByTokenHash,
  insertSession,
  setSessionLock,
  touchSession,
} from '../repositories/sessions-repository';
import {
  countUsers,
  findUserById,
  findUserByUsername,
  insertUser,
  listActiveOwners,
  listActiveUsers,
  type UserRow,
  updateUser,
} from '../repositories/users-repository';
import {
  generateRecoveryCode,
  generateSessionToken,
  hashSecret,
  hashToken,
  normalizeRecoveryCode,
  verifyAgainstDummy,
  verifySecret,
} from '../security/secrets';
import type { ServiceContext } from './context';
import { auditSnapshot, toUser } from './user-mapper';

/** A session ends after 12 h without requests. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** last_seen_at is written at most this often, to avoid a DB write per request. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export interface ResolvedSession {
  user: UserRow;
  sessionId: string;
  locked: boolean;
}

const iso = (date: Date) => date.toISOString();
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);

function createSession(db: Executor, userId: string, now: Date): string {
  const token = generateSessionToken();
  insertSession(db, {
    userId,
    tokenHash: hashToken(token),
    lastSeenAt: iso(now),
    expiresAt: iso(plus(now, SESSION_IDLE_MS)),
  });
  return token;
}

async function issueRecoveryCode(): Promise<{ code: string; hash: string }> {
  const code = generateRecoveryCode();
  return { code, hash: await hashSecret(normalizeRecoveryCode(code)) };
}

export function getSetupStatus(ctx: ServiceContext): { needsSetup: boolean } {
  return { needsSetup: countUsers(ctx.db) === 0 };
}

/** Creates the first owner, logs them in, and returns their one-time recovery code. */
export async function setup(
  ctx: ServiceContext,
  input: SetupRequest,
): Promise<RecoveryCodeResponse & { token: string }> {
  const pinHash = await hashSecret(input.pin);
  const recovery = await issueRecoveryCode();
  return ctx.db.transaction((tx) => {
    if (countUsers(tx) > 0) {
      throw appErrors.setupAlreadyDone();
    }
    const user = insertUser(tx, {
      username: input.username,
      name: input.name,
      role: 'owner',
      pinHash,
      recoveryCodeHash: recovery.hash,
      mustChangePin: false,
    });
    insertAudit(tx, {
      userId: user.id,
      entity: 'user',
      entityId: user.id,
      action: 'setup',
      newValue: auditSnapshot(user),
    });
    const token = createSession(tx, user.id, ctx.now());
    return { user: toUser(user), recoveryCode: recovery.code, token };
  });
}

/**
 * Failed PIN attempts are audit-logged with the user and the intended action; there is no
 * lockout (docs/design.md 5).
 */
function auditFailedPin(
  db: Executor,
  entry: {
    /** The logged-in user, if any (unlock, approval). */
    userId: string | null;
    /** The user whose PIN was tried (the tile at login; the cashier for approvals). */
    subjectId: string;
    context: 'login' | 'unlock' | 'approve';
    scope?: string;
    targetId?: string | null;
  },
): void {
  insertAudit(db, {
    userId: entry.userId,
    entity: 'auth',
    entityId: entry.subjectId,
    action: 'failed_pin',
    newValue: {
      context: entry.context,
      ...(entry.scope ? { scope: entry.scope } : {}),
      ...(entry.targetId ? { targetId: entry.targetId } : {}),
    },
  });
}

/** Login tiles: active users only, without usernames. */
export function listLoginUsers(ctx: ServiceContext): LoginUser[] {
  return listActiveUsers(ctx.db).map((u) => ({ id: u.id, name: u.name, role: u.role }));
}

export async function login(
  ctx: ServiceContext,
  input: LoginRequest,
): Promise<{ user: User; token: string }> {
  const row = findUserById(ctx.db, input.userId);
  if (!row?.active) {
    await verifyAgainstDummy(input.pin);
    auditFailedPin(ctx.db, { userId: null, subjectId: input.userId, context: 'login' });
    throw appErrors.invalidCredentials();
  }
  if (!(await verifySecret(input.pin, row.pinHash))) {
    auditFailedPin(ctx.db, { userId: null, subjectId: row.id, context: 'login' });
    throw appErrors.invalidCredentials();
  }
  const token = createSession(ctx.db, row.id, ctx.now());
  return { user: toUser(row), token };
}

/** Ctrl+L or idle: the session stays, but only its own user can unlock it. */
export function lock(ctx: ServiceContext, sessionId: string): void {
  setSessionLock(ctx.db, sessionId, iso(ctx.now()));
  ctx.approvals.revokeSession(sessionId);
}

export async function unlock(ctx: ServiceContext, session: ResolvedSession, pin: string) {
  if (!(await verifySecret(pin, session.user.pinHash))) {
    auditFailedPin(ctx.db, {
      userId: session.user.id,
      subjectId: session.user.id,
      context: 'unlock',
    });
    throw appErrors.wrongPin();
  }
  setSessionLock(ctx.db, session.sessionId, null);
}

/**
 * A cashier asks an owner to type their PIN. The PIN is tried against every active owner;
 * the matching owner approves. Grants are audit-logged; failures too.
 */
export async function approve(
  ctx: ServiceContext,
  session: ResolvedSession,
  input: ApproveRequest,
): Promise<ApproveResponse> {
  let owner: UserRow | undefined;
  for (const candidate of listActiveOwners(ctx.db)) {
    if (await verifySecret(input.pin, candidate.pinHash)) {
      owner = candidate;
      break;
    }
  }
  const targetId = input.targetId ?? null;
  if (!owner) {
    auditFailedPin(ctx.db, {
      userId: session.user.id,
      subjectId: session.user.id,
      context: 'approve',
      scope: input.scope,
      targetId,
    });
    throw appErrors.wrongOwnerPin();
  }
  const approval = ctx.approvals.grant({
    scope: input.scope,
    targetId,
    sessionId: session.sessionId,
    cashierId: session.user.id,
    ownerId: owner.id,
  });
  insertAudit(ctx.db, {
    userId: session.user.id,
    approvedBy: owner.id,
    entity: 'approval',
    entityId: approval.targetId ?? input.scope,
    action: 'grant',
    newValue: { scope: input.scope, targetId: approval.targetId, kind: approval.kind },
  });
  return {
    token: approval.token,
    expiresAt: new Date(approval.expiresAt).toISOString(),
    ownerName: owner.name,
  };
}

export function logout(ctx: ServiceContext, sessionId: string): void {
  expireSession(ctx.db, sessionId, iso(ctx.now()));
  ctx.approvals.revokeSession(sessionId);
}

/** Looks up a live session for an active user and extends its idle expiry. */
export function resolveSession(ctx: ServiceContext, token: string): ResolvedSession | null {
  const now = ctx.now();
  const session = findLiveSessionByTokenHash(ctx.db, hashToken(token), iso(now));
  if (!session) {
    return null;
  }
  const user = findUserById(ctx.db, session.userId);
  if (!user?.active) {
    return null;
  }
  if (now.getTime() - Date.parse(session.lastSeenAt) >= SESSION_TOUCH_INTERVAL_MS) {
    touchSession(ctx.db, session.id, iso(now), iso(plus(now, SESSION_IDLE_MS)));
  }
  return { user, sessionId: session.id, locked: session.lockedAt !== null };
}

/**
 * Changes the user's own PIN and clears must_change_pin. An owner without a recovery code
 * (created by another owner) receives their first one here.
 */
export async function changeOwnPin(
  ctx: ServiceContext,
  userId: string,
  input: ChangePinRequest,
): Promise<ChangePinResponse> {
  const row = findUserById(ctx.db, userId);
  if (!row) {
    throw appErrors.unauthenticated();
  }
  if (!(await verifySecret(input.currentPin, row.pinHash))) {
    throw appErrors.wrongCurrentPin();
  }
  const pinHash = await hashSecret(input.newPin);
  const recovery =
    row.role === 'owner' && row.recoveryCodeHash === null ? await issueRecoveryCode() : undefined;
  return ctx.db.transaction((tx) => {
    const updated = updateUser(tx, row.id, {
      pinHash,
      mustChangePin: false,
      ...(recovery ? { recoveryCodeHash: recovery.hash } : {}),
    });
    insertAudit(tx, {
      userId: row.id,
      entity: 'user',
      entityId: row.id,
      action: 'change_pin',
      oldValue: { mustChangePin: row.mustChangePin },
      newValue: { mustChangePin: false, recoveryCodeIssued: recovery !== undefined },
    });
    return recovery
      ? { user: toUser(updated), recoveryCode: recovery.code }
      : { user: toUser(updated) };
  });
}

/** Owner-only PIN reset with their recovery code. Issues a new code and ends open sessions. */
export async function recoverPin(
  ctx: ServiceContext,
  input: RecoverRequest,
): Promise<RecoveryCodeResponse> {
  const code = normalizeRecoveryCode(input.recoveryCode);
  const row = findUserByUsername(ctx.db, input.username);
  if (row?.role !== 'owner' || !row.active || row.recoveryCodeHash === null) {
    await verifyAgainstDummy(code);
    throw appErrors.invalidRecovery();
  }
  const usedHash = row.recoveryCodeHash;
  if (!(await verifySecret(code, usedHash))) {
    throw appErrors.invalidRecovery();
  }
  const pinHash = await hashSecret(input.newPin);
  const recovery = await issueRecoveryCode();
  return ctx.db.transaction((tx) => {
    // A concurrent recovery may have consumed this code while we were hashing.
    if (findUserById(tx, row.id)?.recoveryCodeHash !== usedHash) {
      throw appErrors.invalidRecovery();
    }
    const updated = updateUser(tx, row.id, {
      pinHash,
      recoveryCodeHash: recovery.hash,
      mustChangePin: false,
    });
    expireUserSessions(tx, row.id, iso(ctx.now()));
    insertAudit(tx, {
      userId: row.id,
      entity: 'user',
      entityId: row.id,
      action: 'recover_pin',
      newValue: { recoveryCodeIssued: true },
    });
    return { user: toUser(updated), recoveryCode: recovery.code };
  });
}
