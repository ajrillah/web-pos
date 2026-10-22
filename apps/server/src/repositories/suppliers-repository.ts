import { and, asc, count, eq, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { suppliers } from '../db/schema';

export type SupplierRow = typeof suppliers.$inferSelect;
export type SupplierPatch = Partial<Pick<SupplierRow, 'name' | 'phone' | 'note' | 'active'>>;
export type SupplierWithBalance = SupplierRow & { balance: number };

/**
 * Remaining debt: completed purchases only (voided ones do not count). Explicit aliases:
 * Drizzle leaves columns unqualified in single-table queries.
 */
const balance = sql<number>`coalesce((select sum(p.remaining) from purchases p
  where p.supplier_id = "suppliers"."id" and p.status = 'completed'), 0)`;

const withBalance = { supplier: suppliers, balance };
const flatten = (r: { supplier: SupplierRow; balance: number }): SupplierWithBalance => ({
  ...r.supplier,
  balance: r.balance,
});

export function findSupplierById(db: Executor, id: string): SupplierWithBalance | undefined {
  const row = db.select(withBalance).from(suppliers).where(eq(suppliers.id, id)).get();
  return row && flatten(row);
}

export interface SupplierSearch {
  words: string[];
  active?: boolean | undefined;
  withBalance?: boolean | undefined;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchSuppliers(
  db: Executor,
  search: SupplierSearch,
): { rows: SupplierWithBalance[]; total: number } {
  const conditions: SQL[] = search.words.map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    return sql`(${suppliers.name} LIKE ${pattern} ESCAPE '\\' OR ${suppliers.phone} LIKE ${pattern} ESCAPE '\\')`;
  });
  if (search.active !== undefined) conditions.push(eq(suppliers.active, search.active));
  if (search.withBalance) conditions.push(sql`${balance} > 0`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db
    .select(withBalance)
    .from(suppliers)
    .where(where)
    .orderBy(asc(suppliers.name))
    .limit(search.limit)
    .offset(search.offset)
    .all()
    .map(flatten);
  const total = db.select({ n: count() }).from(suppliers).where(where).get()?.n ?? 0;
  return { rows, total };
}

export function insertSupplier(
  db: Executor,
  row: Pick<SupplierRow, 'name' | 'phone' | 'note'>,
): SupplierRow {
  return db.insert(suppliers).values(row).returning().get();
}

export function updateSupplier(db: Executor, id: string, patch: SupplierPatch): SupplierRow {
  return db.update(suppliers).set(patch).where(eq(suppliers.id, id)).returning().get();
}
