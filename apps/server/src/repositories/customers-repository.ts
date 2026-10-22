import { and, asc, count, eq, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { customers, receivables } from '../db/schema';

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerPatch = Partial<Pick<CustomerRow, 'name' | 'phone' | 'note' | 'active'>>;
export type CustomerWithBalance = CustomerRow & { balance: number };

/** Remaining kasbon: open receivables only (paid ones have 0, voided ones do not count). */
const balance = sql<number>`coalesce((select sum(${receivables.remaining}) from ${receivables}
  where ${receivables.customerId} = ${customers.id} and ${receivables.status} = 'open'), 0)`;

const withBalance = { customer: customers, balance };
const flatten = (r: { customer: CustomerRow; balance: number }): CustomerWithBalance => ({
  ...r.customer,
  balance: r.balance,
});

export function findCustomerById(db: Executor, id: string): CustomerWithBalance | undefined {
  const row = db.select(withBalance).from(customers).where(eq(customers.id, id)).get();
  return row && flatten(row);
}

export interface CustomerSearch {
  words: string[];
  active?: boolean | undefined;
  withBalance?: boolean | undefined;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchCustomers(
  db: Executor,
  search: CustomerSearch,
): { rows: CustomerWithBalance[]; total: number } {
  const conditions: SQL[] = search.words.map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    return sql`(${customers.name} LIKE ${pattern} ESCAPE '\\' OR ${customers.phone} LIKE ${pattern} ESCAPE '\\')`;
  });
  if (search.active !== undefined) conditions.push(eq(customers.active, search.active));
  if (search.withBalance) conditions.push(sql`${balance} > 0`);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db
    .select(withBalance)
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name))
    .limit(search.limit)
    .offset(search.offset)
    .all()
    .map(flatten);
  const total = db.select({ n: count() }).from(customers).where(where).get()?.n ?? 0;
  return { rows, total };
}

export function insertCustomer(
  db: Executor,
  row: Pick<CustomerRow, 'name' | 'phone' | 'note'>,
): CustomerRow {
  return db.insert(customers).values(row).returning().get();
}

export function updateCustomer(db: Executor, id: string, patch: CustomerPatch): CustomerRow {
  return db.update(customers).set(patch).where(eq(customers.id, id)).returning().get();
}
