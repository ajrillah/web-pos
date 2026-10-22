import { and, asc, count, desc, eq, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { purchaseItems, purchases, suppliers, users } from '../db/schema';

export type PurchaseRow = typeof purchases.$inferSelect;
export type NewPurchaseRow = typeof purchases.$inferInsert;
export type PurchaseItemRow = typeof purchaseItems.$inferSelect;
export type NewPurchaseItemRow = typeof purchaseItems.$inferInsert;
export type PurchaseWithRefs = PurchaseRow & {
  supplierName: string;
  userName: string;
  itemCount: number;
};

// Explicit names: Drizzle leaves columns unqualified in single-table queries.
const itemCount = sql<number>`(select count(*) from purchase_items i where i.purchase_id = "purchases"."id")`;

const withRefs = {
  purchase: purchases,
  supplierName: suppliers.name,
  userName: users.name,
  itemCount,
};

const flatten = (r: {
  purchase: PurchaseRow;
  supplierName: string;
  userName: string;
  itemCount: number;
}): PurchaseWithRefs => ({
  ...r.purchase,
  supplierName: r.supplierName,
  userName: r.userName,
  itemCount: r.itemCount,
});

const selectWithRefs = (db: Executor) =>
  db
    .select(withRefs)
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .innerJoin(users, eq(users.id, purchases.userId));

export function purchaseIdExists(db: Executor, id: string): boolean {
  return (
    db.select({ id: purchases.id }).from(purchases).where(eq(purchases.id, id)).get() !== undefined
  );
}

export function findPurchaseById(db: Executor, id: string): PurchaseWithRefs | undefined {
  const row = selectWithRefs(db).where(eq(purchases.id, id)).get();
  return row && flatten(row);
}

export interface PurchaseSearch {
  /** UTC ISO bounds of created_at: from inclusive, to exclusive. */
  from?: string | undefined;
  to?: string | undefined;
  supplierId?: string | undefined;
  q?: string | undefined;
  status?: 'completed' | 'voided' | undefined;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Purchases, newest first. */
export function searchPurchases(
  db: Executor,
  search: PurchaseSearch,
): { rows: PurchaseWithRefs[]; total: number } {
  const conditions: SQL[] = [];
  if (search.from) conditions.push(gte(purchases.createdAt, search.from));
  if (search.to) conditions.push(lt(purchases.createdAt, search.to));
  if (search.supplierId) conditions.push(eq(purchases.supplierId, search.supplierId));
  if (search.status) conditions.push(eq(purchases.status, search.status));
  if (search.q) {
    const pattern = `%${escapeLike(search.q)}%`;
    conditions.push(
      or(
        sql`${purchases.number} LIKE ${pattern} ESCAPE '\\'`,
        sql`${suppliers.name} LIKE ${pattern} ESCAPE '\\'`,
      ) as SQL,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = selectWithRefs(db)
    .where(where)
    .orderBy(desc(purchases.createdAt), desc(purchases.number))
    .limit(search.limit)
    .offset(search.offset)
    .all()
    .map(flatten);
  const total =
    db
      .select({ n: count() })
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where)
      .get()?.n ?? 0;
  return { rows, total };
}

/** Completed purchases with remaining debt (or the given ids), oldest first. */
export function listPayables(
  db: Executor,
  filter: { supplierId?: string | undefined; ids?: string[] },
): PurchaseWithRefs[] {
  const conditions: SQL[] = [eq(purchases.status, 'completed'), sql`${purchases.remaining} > 0`];
  if (filter.supplierId) conditions.push(eq(purchases.supplierId, filter.supplierId));
  if (filter.ids) conditions.push(inArray(purchases.id, filter.ids));
  return selectWithRefs(db)
    .where(and(...conditions))
    .orderBy(asc(purchases.createdAt), asc(purchases.number))
    .all()
    .map(flatten);
}

/** Every purchase of a supplier, oldest first (Kartu Hutang). */
export function listPurchasesOfSupplier(db: Executor, supplierId: string): PurchaseWithRefs[] {
  return selectWithRefs(db)
    .where(eq(purchases.supplierId, supplierId))
    .orderBy(asc(purchases.createdAt), asc(purchases.number))
    .all()
    .map(flatten);
}

export function findPurchasesByIds(db: Executor, ids: string[]): PurchaseRow[] {
  if (ids.length === 0) return [];
  return db.select().from(purchases).where(inArray(purchases.id, ids)).all();
}

/** Highest purchase number with this `BLI-YYYYMMDD-` prefix (longest first, so 10000 > 9999). */
export function lastPurchaseNumber(db: Executor, prefix: string): string | undefined {
  return db
    .select({ number: purchases.number })
    .from(purchases)
    .where(sql`${purchases.number} LIKE ${`${prefix}%`}`)
    .orderBy(desc(sql`length(${purchases.number})`), desc(purchases.number))
    .limit(1)
    .get()?.number;
}

export function insertPurchase(db: Executor, row: NewPurchaseRow): void {
  db.insert(purchases).values(row).run();
}

export function insertPurchaseItems(db: Executor, rows: NewPurchaseItemRow[]): void {
  if (rows.length > 0) db.insert(purchaseItems).values(rows).run();
}

export function listPurchaseItems(db: Executor, purchaseIds: string[]): PurchaseItemRow[] {
  if (purchaseIds.length === 0) return [];
  return db
    .select()
    .from(purchaseItems)
    .where(inArray(purchaseItems.purchaseId, purchaseIds))
    .orderBy(asc(purchaseItems.purchaseId), asc(purchaseItems.lineNo))
    .all();
}

export function updatePurchase(
  db: Executor,
  id: string,
  patch: Partial<
    Pick<
      PurchaseRow,
      'paidAmount' | 'remaining' | 'status' | 'voidedAt' | 'voidedBy' | 'voidReason'
    >
  >,
): void {
  db.update(purchases).set(patch).where(eq(purchases.id, id)).run();
}

/** The product's most recent line on a completed purchase. */
export function lastPurchaseItemOf(
  db: Executor,
  productId: string,
): (PurchaseItemRow & { purchaseDate: string }) | undefined {
  const row = db
    .select({ item: purchaseItems, purchaseDate: purchases.date })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .where(and(eq(purchaseItems.productId, productId), eq(purchases.status, 'completed')))
    .orderBy(desc(purchases.createdAt), desc(purchaseItems.lineNo))
    .limit(1)
    .get();
  return row && { ...row.item, purchaseDate: row.purchaseDate };
}
