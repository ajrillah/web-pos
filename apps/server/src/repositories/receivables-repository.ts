import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { customers, receivables, sales } from '../db/schema';

export type ReceivableRow = typeof receivables.$inferSelect;
export type ReceivableWithRefs = ReceivableRow & { customerName: string; saleNumber: string };

const withRefs = {
  receivable: receivables,
  customerName: customers.name,
  saleNumber: sales.number,
};

const flatten = (r: {
  receivable: ReceivableRow;
  customerName: string;
  saleNumber: string | null;
}): ReceivableWithRefs => ({
  ...r.receivable,
  customerName: r.customerName,
  saleNumber: r.saleNumber ?? '',
});

/** Receivables, oldest first (the order payments fill them). */
export function listReceivables(
  db: Executor,
  filter: { customerId?: string | undefined; openOnly?: boolean; ids?: string[] },
): ReceivableWithRefs[] {
  const conditions: SQL[] = [];
  if (filter.customerId) conditions.push(eq(receivables.customerId, filter.customerId));
  if (filter.openOnly) conditions.push(eq(receivables.status, 'open'));
  if (filter.ids) conditions.push(inArray(receivables.id, filter.ids));
  return db
    .select(withRefs)
    .from(receivables)
    .innerJoin(customers, eq(customers.id, receivables.customerId))
    .innerJoin(sales, eq(sales.id, receivables.saleId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(receivables.createdAt), asc(sales.number))
    .all()
    .map(flatten);
}

export function insertReceivable(
  db: Executor,
  row: Pick<ReceivableRow, 'customerId' | 'saleId' | 'amount' | 'remaining' | 'status'> &
    Partial<Pick<ReceivableRow, 'createdAt' | 'updatedAt'>>,
): void {
  db.insert(receivables).values(row).run();
}

export function updateReceivable(
  db: Executor,
  id: string,
  patch: Partial<Pick<ReceivableRow, 'remaining' | 'status'>>,
): void {
  db.update(receivables).set(patch).where(eq(receivables.id, id)).run();
}

export function findReceivableBySale(db: Executor, saleId: string): ReceivableRow | undefined {
  return db.select().from(receivables).where(eq(receivables.saleId, saleId)).get();
}
