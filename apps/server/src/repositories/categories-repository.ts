import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { categories } from '../db/schema';

export type CategoryRow = typeof categories.$inferSelect;
export type CategoryPatch = Partial<Pick<CategoryRow, 'name' | 'active'>>;

/** Defaults first, then by name. */
export function listCategories(db: Executor): CategoryRow[] {
  return db
    .select()
    .from(categories)
    .orderBy(desc(categories.isDefault), asc(categories.name))
    .all();
}

export function findCategoryById(db: Executor, id: string): CategoryRow | undefined {
  return db.select().from(categories).where(eq(categories.id, id)).get();
}

/** Case-insensitive, like the unique index. */
export function findCategoryByName(db: Executor, name: string): CategoryRow | undefined {
  return db.select().from(categories).where(sql`${categories.name} = ${name} COLLATE NOCASE`).get();
}

export function insertCategory(db: Executor, name: string): CategoryRow {
  return db.insert(categories).values({ name }).returning().get();
}

export function updateCategory(db: Executor, id: string, patch: CategoryPatch): CategoryRow {
  return db.update(categories).set(patch).where(eq(categories.id, id)).returning().get();
}
