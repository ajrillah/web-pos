import { and, eq, gt } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { sessions } from '../db/schema';

export type SessionRow = typeof sessions.$inferSelect;

export function insertSession(
  db: Executor,
  row: { userId: string; tokenHash: string; lastSeenAt: string; expiresAt: string },
): SessionRow {
  return db.insert(sessions).values(row).returning().get();
}

/** Returns the session only while it has not expired at `now` (ISO 8601 UTC). */
export function findLiveSessionByTokenHash(
  db: Executor,
  tokenHash: string,
  now: string,
): SessionRow | undefined {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .get();
}

export function touchSession(
  db: Executor,
  id: string,
  lastSeenAt: string,
  expiresAt: string,
): void {
  db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, id)).run();
}

/** Ends a session by moving its expiry to `now`; rows are kept. */
export function expireSession(db: Executor, id: string, now: string): void {
  db.update(sessions).set({ expiresAt: now }).where(eq(sessions.id, id)).run();
}

export function expireUserSessions(db: Executor, userId: string, now: string): void {
  db.update(sessions)
    .set({ expiresAt: now })
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .run();
}

/** Locks (timestamp) or unlocks (null) a session. */
export function setSessionLock(db: Executor, id: string, lockedAt: string | null): void {
  db.update(sessions).set({ lockedAt }).where(eq(sessions.id, id)).run();
}
