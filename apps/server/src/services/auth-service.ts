import type {
  ChangePinRequest,
  ChangePinResponse,
  LoginRequest,
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
  touchSession,
} from '../repositories/sessions-repository';
import {
  countUsers,
  findUserById,
  findUserByUsername,
  insertUser,
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

export async function login(
  ctx: ServiceContext,
  input: LoginRequest,
): Promise<{ user: User; token: string }> {
  const row = findUserByUsername(ctx.db, input.username);
  if (!row?.active) {
    await verifyAgainstDummy(input.pin);
    throw appErrors.invalidCredentials();
  }
  if (!(await verifySecret(input.pin, row.pinHash))) {
    throw appErrors.invalidCredentials();
  }
  const token = createSession(ctx.db, row.id, ctx.now());
  return { user: toUser(row), token };
}

export function logout(ctx: ServiceContext, sessionId: string): void {
  expireSession(ctx.db, sessionId, iso(ctx.now()));
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
  return { user, sessionId: session.id };
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
