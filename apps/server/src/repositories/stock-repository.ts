import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { products, stockAdjustments, stockMovements } from '../db/schema';

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
