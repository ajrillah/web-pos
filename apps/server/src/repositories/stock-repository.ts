import { and, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { products, stockAdjustments, stockMovements, users } from '../db/schema';

export type NewAdjustmentRow = typeof stockAdjustments.$inferInsert;
export type AdjustmentRow = typeof stockAdjustments.$inferSelect;
export type NewMovementRow = typeof stockMovements.$inferInsert;

export function insertAdjustment(db: Executor, row: NewAdjustmentRow): AdjustmentRow {
  return db.insert(stockAdjustments).values(row).returning().get();
}

export function insertMovement(db: Executor, row: NewMovementRow): void {
  db.insert(stockMovements).values(row).run();
}

/** Adds `delta` to the cached stock. Only call next to insertMovement, in one transaction. */
export function addToStockCache(db: Executor, productId: string, delta: number): void {
  db.update(products)
    .set({ stock: sql`${products.stock} + ${delta}` })
    .where(eq(products.id, productId))
    .run();
}

/** SUM(qty_change) of a product's movements: the stock source of truth. */
export function sumMovements(db: Executor, productId: string): number {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${stockMovements.qtyChange}), 0)` })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .get()?.total ?? 0
  );
}

/** Ids among `productIds` that have at least one stock movement. */
export function productIdsWithMovements(db: Executor, productIds: string[]): Set<string> {
  if (productIds.length === 0) return new Set();
  const rows = db
    .selectDistinct({ productId: stockMovements.productId })
    .from(stockMovements)
    .where(inArray(stockMovements.productId, productIds))
    .all();
  return new Set(rows.map((r) => r.productId));
}

export interface AdjustmentWithRefs extends AdjustmentRow {
  productCode: string;
  productName: string;
  baseUnit: string;
  pricingFactor: number;
  userName: string;
}

const adjustmentWithRefs = {
  adjustment: stockAdjustments,
  productCode: products.code,
  productName: products.name,
  baseUnit: products.baseUnit,
  pricingFactor: products.pricingFactor,
  userName: users.name,
};

/** Adjustments, newest (last recorded) first. */
export function searchAdjustments(
  db: Executor,
  filter: {
    productId?: string | undefined;
    reason?: AdjustmentRow['reason'] | undefined;
    ids?: string[];
    limit: number;
    offset: number;
  },
): { rows: AdjustmentWithRefs[]; total: number } {
  const conditions: SQL[] = [];
  if (filter.productId) conditions.push(eq(stockAdjustments.productId, filter.productId));
  if (filter.reason) conditions.push(eq(stockAdjustments.reason, filter.reason));
  if (filter.ids) conditions.push(inArray(stockAdjustments.id, filter.ids));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db
    .select(adjustmentWithRefs)
    .from(stockAdjustments)
    .innerJoin(products, eq(products.id, stockAdjustments.productId))
    .innerJoin(users, eq(users.id, stockAdjustments.userId))
    .where(where)
    .orderBy(desc(sql`${stockAdjustments}.rowid`))
    .limit(filter.limit)
    .offset(filter.offset)
    .all()
    .map((r) => ({
      ...r.adjustment,
      productCode: r.productCode,
      productName: r.productName,
      baseUnit: r.baseUnit,
      pricingFactor: r.pricingFactor,
      userName: r.userName,
    }));
  const total = db.select({ n: count() }).from(stockAdjustments).where(where).get()?.n ?? 0;
  return { rows, total };
}

export interface MovementSearch {
  productId?: string | undefined;
  type?: MovementRow['type'] | undefined;
  /** UTC ISO bounds: from inclusive, to exclusive. */
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  offset: number;
}

export type MovementRow = typeof stockMovements.$inferSelect;

export interface MovementWithRefs extends MovementRow {
  productCode: string;
  productName: string;
  baseUnit: string;
  refNumber: string | null;
  reason: AdjustmentRow['reason'] | null;
  note: string | null;
  userName: string;
  balanceAfter: number;
}

/**
 * Movements newest first, with the product's stock right after each one (running sum over
 * all of the product's movements, in insertion order).
 */
export function searchMovements(
  db: Executor,
  search: MovementSearch,
): { rows: MovementWithRefs[]; total: number } {
  const conditions: SQL[] = [];
  if (search.productId) conditions.push(sql`m.product_id = ${search.productId}`);
  if (search.type) conditions.push(sql`m.type = ${search.type}`);
  if (search.from) conditions.push(sql`m.created_at >= ${search.from}`);
  if (search.to) conditions.push(sql`m.created_at < ${search.to}`);
  const where = conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  // The running balance needs every movement of the product, so filter after the window.
  const scope = search.productId ? sql`where product_id = ${search.productId}` : sql``;
  const rows = db.all<{
    id: string;
    product_id: string;
    qty_change: number;
    type: MovementRow['type'];
    ref_id: string;
    user_id: string;
    created_at: string;
    balance_after: number;
    product_code: string;
    product_name: string;
    base_unit: string;
    ref_number: string | null;
    reason: AdjustmentRow['reason'] | null;
    note: string | null;
    user_name: string;
  }>(sql`
    with m as (
      select sm.*, sm.rowid as seq,
        sum(sm.qty_change) over (partition by sm.product_id order by sm.rowid) as balance_after
      from stock_movements sm ${scope}
    )
    select m.id, m.product_id, m.qty_change, m.type, m.ref_id, m.user_id, m.created_at,
      m.balance_after, p.code as product_code, p.name as product_name, p.base_unit,
      coalesce(s.number, pu.number) as ref_number, a.reason, a.note, u.name as user_name
    from m
    join products p on p.id = m.product_id
    join users u on u.id = m.user_id
    left join sales s on s.id = m.ref_id and m.type in ('sale', 'void')
    left join purchases pu on pu.id = m.ref_id and m.type in ('purchase', 'purchase_void')
    left join stock_adjustments a on a.id = m.ref_id and m.type = 'adjustment'
    ${where}
    order by m.seq desc
    limit ${search.limit} offset ${search.offset}
  `);
  const total =
    db.get<{ n: number }>(sql`select count(*) as n from stock_movements m ${where}`)?.n ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      qtyChange: r.qty_change,
      type: r.type,
      refId: r.ref_id,
      userId: r.user_id,
      createdAt: r.created_at,
      balanceAfter: r.balance_after,
      productCode: r.product_code,
      productName: r.product_name,
      baseUnit: r.base_unit,
      refNumber: r.ref_number,
      reason: r.reason,
      note: r.note,
      userName: r.user_name,
    })),
    total,
  };
}
