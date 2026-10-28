import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { Executor } from '../db/client';
import { customers, saleItems, salePayments, sales, users } from '../db/schema';

export type SaleRow = typeof sales.$inferSelect;
export type NewSaleRow = typeof sales.$inferInsert;
export type SaleItemRow = typeof saleItems.$inferSelect;
export type NewSaleItemRow = typeof saleItems.$inferInsert;
export type SalePaymentRow = typeof salePayments.$inferSelect;
export type SaleWithCashier = SaleRow & {
  cashierName: string;
  customerName: string | null;
  itemCount: number;
};

// Explicit names: Drizzle leaves columns unqualified in single-table queries.
const itemCount = sql<number>`(select count(*) from sale_items i where i.sale_id = "sales"."id")`;

const withCashier = {
  sale: sales,
  cashierName: users.name,
  customerName: customers.name,
  itemCount,
};

const flatten = (r: {
  sale: SaleRow;
  cashierName: string;
  customerName: string | null;
  itemCount: number;
}): SaleWithCashier => ({
  ...r.sale,
  cashierName: r.cashierName,
  customerName: r.customerName,
  itemCount: r.itemCount,
});

export function findSaleById(db: Executor, id: string): SaleWithCashier | undefined {
  const row = db
    .select(withCashier)
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.id, id))
    .get();
  return row && flatten(row);
}

export function saleIdExists(db: Executor, id: string): boolean {
  return db.select({ id: sales.id }).from(sales).where(eq(sales.id, id)).get() !== undefined;
}

/** Highest sale number with this `TRX-YYYYMMDD-` prefix (longest first, so 10000 > 9999). */
export function lastSaleNumber(db: Executor, prefix: string): string | undefined {
  return (
    db
      .select({ number: sales.number })
      .from(sales)
      .where(sql`${sales.number} LIKE ${`${prefix}%`}`)
      .orderBy(desc(sql`length(${sales.number})`), desc(sales.number))
      .limit(1)
      .get()?.number ?? undefined
  );
}

export function insertSale(db: Executor, row: NewSaleRow): void {
  db.insert(sales).values(row).run();
}

export function updateSale(
  db: Executor,
  id: string,
  patch: Partial<
    Pick<
      SaleRow,
      'receiptCount' | 'receiptFile' | 'status' | 'voidedAt' | 'voidedBy' | 'voidReason'
    >
  >,
): void {
  db.update(sales).set(patch).where(eq(sales.id, id)).run();
}

export function insertSaleItems(db: Executor, rows: NewSaleItemRow[]): void {
  if (rows.length > 0) db.insert(saleItems).values(rows).run();
}

export function insertSalePayments(
  db: Executor,
  rows: { saleId: string; method: 'cash' | 'qris' | 'transfer'; amount: number }[],
): void {
  if (rows.length > 0) db.insert(salePayments).values(rows).run();
}

export function listSaleItems(db: Executor, saleIds: string[]): SaleItemRow[] {
  if (saleIds.length === 0) return [];
  return db
    .select()
    .from(saleItems)
    .where(inArray(saleItems.saleId, saleIds))
    .orderBy(asc(saleItems.lineNo))
    .all();
}

export function listSalePayments(db: Executor, saleIds: string[]): SalePaymentRow[] {
  if (saleIds.length === 0) return [];
  return db.select().from(salePayments).where(inArray(salePayments.saleId, saleIds)).all();
}

/** Held sales, newest first; optionally only those created before `before` (ISO UTC). */
export function listHeldSales(db: Executor, before?: string): SaleWithCashier[] {
  const conditions = [eq(sales.status, 'held')];
  if (before !== undefined) conditions.push(lt(sales.createdAt, before));
  return db
    .select(withCashier)
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(...conditions))
    .orderBy(desc(sales.createdAt))
    .all()
    .map(flatten);
}

/** Hard-deletes held sales and their items. Held sales are drafts (docs/design.md 6.1). */
export function deleteHeldSales(db: Executor, ids: string[]): void {
  if (ids.length === 0) return;
  db.delete(saleItems).where(inArray(saleItems.saleId, ids)).run();
  db.delete(sales)
    .where(and(inArray(sales.id, ids), eq(sales.status, 'held')))
    .run();
}

export interface SaleSearch {
  /** ISO UTC range on completed_at: [from, to). */
  from: string;
  to: string;
  q?: string | undefined;
  status?: 'completed' | 'voided' | undefined;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Completed and voided sales in a range, newest first. */
export function searchSales(
  db: Executor,
  search: SaleSearch,
): { rows: SaleWithCashier[]; total: number } {
  const conditions: SQL[] = [gte(sales.completedAt, search.from), lt(sales.completedAt, search.to)];
  conditions.push(
    search.status
      ? eq(sales.status, search.status)
      : inArray(sales.status, ['completed', 'voided']),
  );
  if (search.q) {
    const pattern = `%${escapeLike(search.q)}%`;
    const like = (column: SQL | typeof sales.number) => sql`${column} LIKE ${pattern} ESCAPE '\\'`;
    const matchesItem = or(
      like(sql`${saleItems.productName}`),
      like(sql`${saleItems.productCode}`),
    );
    conditions.push(
      or(
        like(sales.number),
        exists(
          db
            .select({ one: sql`1` })
            .from(saleItems)
            .where(and(eq(saleItems.saleId, sales.id), matchesItem)),
        ),
      ) as SQL,
    );
  }
  const where = and(...conditions);
  const rows = db
    .select(withCashier)
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where)
    .orderBy(desc(sales.completedAt))
    .limit(search.limit)
    .offset(search.offset)
    .all()
    .map(flatten);
  const total = db.select({ n: count() }).from(sales).where(where).get()?.n ?? 0;
  return { rows, total };
}
