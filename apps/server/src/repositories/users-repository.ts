import { and, asc, count, eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type UserPatch = Partial<
  Pick<UserRow, 'name' | 'active' | 'pinHash' | 'recoveryCodeHash' | 'mustChangePin'>
>;

export function countUsers(db: Executor): number {
  return db.select({ n: count() }).from(users).get()?.n ?? 0;
}

export function countActiveOwners(db: Executor): number {
  return (
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'owner'), eq(users.active, true)))
      .get()?.n ?? 0
  );
}

export function findUserById(db: Executor, id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function findUserByUsername(db: Executor, username: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export function listUsers(db: Executor): UserRow[] {
  return db.select().from(users).orderBy(asc(users.name), asc(users.username)).all();
}

export function insertUser(db: Executor, row: NewUserRow): UserRow {
  return db.insert(users).values(row).returning().get();
}

export function updateUser(db: Executor, id: string, patch: UserPatch): UserRow {
  return db.update(users).set(patch).where(eq(users.id, id)).returning().get();
}

export function listActiveUsers(db: Executor): UserRow[] {
  return db
    .select()
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name), asc(users.username))
    .all();
}

export function listActiveOwners(db: Executor): UserRow[] {
  return listActiveUsers(db).filter((u) => u.role === 'owner');
}
