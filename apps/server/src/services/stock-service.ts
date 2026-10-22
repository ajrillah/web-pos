import type { AdjustmentReason } from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import {
  addToStockCache,
  insertAdjustment,
  insertMovement,
} from '../repositories/stock-repository';

export interface AdjustmentInput {
  productId: string;
  qtyChange: number;
  reason: AdjustmentReason;
  note: string | null;
  /** Product cost_price at the time of the adjustment. */
  costPrice: number;
  userId: string;
}

/**
 * Records a stock adjustment with its movement and updates the stock cache.
 * Runs inside the caller's transaction; negative stock is allowed.
 */
export function recordAdjustment(tx: Executor, input: AdjustmentInput): void {
  const adjustment = insertAdjustment(tx, input);
  insertMovement(tx, {
    productId: input.productId,
    qtyChange: input.qtyChange,
    type: 'adjustment',
    refId: adjustment.id,
    userId: input.userId,
  });
  addToStockCache(tx, input.productId, input.qtyChange);
}
