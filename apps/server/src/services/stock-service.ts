import {
  type Adjustment,
  type AdjustmentReason,
  type AdjustmentsQuery,
  type AdjustmentsResponse,
  adjustmentsQuerySchema,
  type CompleteOpnameResponse,
  type CreateAdjustmentInput,
  type CreateAdjustmentResponse,
  type MovementsQuery,
  type MovementsResponse,
  movementsQuerySchema,
  nextLocalDay,
  type Opname,
  type OpnameSummary,
  type OpnamesQuery,
  type OpnamesResponse,
  opnamesQuerySchema,
  type StockWarning,
  startOfLocalDay,
  type UpdateOpnameItemsRequest,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { findCategoryById } from '../repositories/categories-repository';
import {
  activeProductsOfCategory,
  findOpnameById,
  insertOpname,
  insertOpnameItems,
  listOpnameItems,
  listOpnames as listOpnameRows,
  type OpnameWithRefs,
  productsInOpenOpnames,
  updateOpname,
  updateOpnameItem,
} from '../repositories/opname-repository';
import { findProductById, findProductsByIds } from '../repositories/products-repository';
import {
  type AdjustmentWithRefs,
  addToStockCache,
  insertAdjustment,
  insertMovement,
  searchAdjustments,
  searchMovements,
} from '../repositories/stock-repository';
import type { Actor, ServiceContext } from './context';
import { stockChains } from './product-service';

export interface AdjustmentInput {
  productId: string;
  qtyChange: number;
  reason: AdjustmentReason;
  note: string | null;
  /** Product cost_price at the time of the adjustment. */
  costPrice: number;
  userId: string;
  createdAt?: string;
}

/**
 * Records a stock adjustment with its movement and updates the stock cache; returns its id.
 * Runs inside the caller's transaction; negative stock is allowed.
 */
export function recordAdjustment(tx: Executor, input: AdjustmentInput): string {
  const adjustment = insertAdjustment(tx, input);
  insertMovement(tx, {
    productId: input.productId,
    qtyChange: input.qtyChange,
    type: 'adjustment',
    refId: adjustment.id,
    userId: input.userId,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  addToStockCache(tx, input.productId, input.qtyChange);
  return adjustment.id;
}

// --- Adjustments, opname, movement history (docs/design.md 6.6) ---

function toAdjustment(row: AdjustmentWithRefs): Adjustment {
  return {
    id: row.id,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    baseUnit: row.baseUnit,
    qtyChange: row.qtyChange,
    reason: row.reason,
    note: row.note,
    costPrice: row.costPrice,
    pricingFactor: row.pricingFactor,
    userName: row.userName,
    createdAt: row.createdAt,
  };
}

function stockWarnings(db: Executor, productIds: string[]): StockWarning[] {
  return findProductsByIds(db, productIds)
    .filter((p) => p.stock < 0)
    .map((p) => ({ productId: p.id, productName: p.name, stock: p.stock, baseUnit: p.baseUnit }));
}

/** Manual adjustment with a reason; valued at the product's current cost. Open to cashiers. */
export function createAdjustment(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateAdjustmentInput,
): CreateAdjustmentResponse {
  return ctx.db.transaction((tx) => {
    const product = findProductById(tx, input.productId);
    if (!product) {
      throw appErrors.productNotFound();
    }
    const id = recordAdjustment(tx, {
      productId: product.id,
      qtyChange: input.qtyChange,
      reason: input.reason,
      note: input.note ?? null,
      costPrice: product.costPrice,
      userId: actor.id,
      createdAt: ctx.now().toISOString(),
    });
    const row = searchAdjustments(tx, { ids: [id], limit: 1, offset: 0 }).rows[0];
    if (!row) throw appErrors.productNotFound();
    return { adjustment: toAdjustment(row), warnings: stockWarnings(tx, [product.id]) };
  });
}

export function listAdjustments(ctx: ServiceContext, query: AdjustmentsQuery): AdjustmentsResponse {
  const { productId, reason, page, limit } = adjustmentsQuerySchema.parse(query);
  const { rows, total } = searchAdjustments(ctx.db, {
    productId,
    reason,
    limit,
    offset: (page - 1) * limit,
  });
  return { adjustments: rows.map(toAdjustment), total, page, limit };
}

function toOpnameSummary(row: OpnameWithRefs): OpnameSummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    status: row.status,
    startedAt: row.startedAt,
    closedAt: row.closedAt,
    userName: row.userName,
    closedByName: row.closedByName,
    itemCount: row.itemCount,
    countedCount: row.countedCount,
  };
}

function loadOpname(db: Executor, id: string): Opname {
  const row = findOpnameById(db, id);
  if (!row) {
    throw appErrors.opnameNotFound();
  }
  const items = listOpnameItems(db, id);
  const chains = stockChains(
    db,
    items.map((i) => i.productId),
  );
  return {
    ...toOpnameSummary(row),
    items: items.map((i) => ({
      productId: i.productId,
      productCode: i.productCode,
      productName: i.productName,
      type: i.type,
      baseUnit: i.baseUnit,
      unitChain: chains.get(i.productId) ?? [],
      systemQtyAtStart: i.systemQtyAtStart,
      currentStock: i.currentStock,
      countedQty: i.countedQty,
      delta: i.countedQty === null ? null : i.countedQty - i.systemQtyAtStart,
    })),
  };
}

function loadOpenOpname(db: Executor, id: string): Opname {
  const opname = loadOpname(db, id);
  if (opname.status !== 'open') {
    throw appErrors.opnameNotOpen();
  }
  return opname;
}

export function listOpnames(ctx: ServiceContext, query: OpnamesQuery): OpnamesResponse {
  const { status } = opnamesQuerySchema.parse(query);
  return {
    opnames: listOpnameRows(ctx.db, status === 'all' ? undefined : status).map(toOpnameSummary),
  };
}

export function getOpname(ctx: ServiceContext, id: string): Opname {
  return loadOpname(ctx.db, id);
}

/**
 * Starts a counting session for every active product of a category, recording each one's
 * stock now. A product can be in only one open session (docs/design.md 6.6).
 */
export function startOpname(ctx: ServiceContext, actor: Actor, categoryId: string): Opname {
  return ctx.db.transaction((tx) => {
    const category = findCategoryById(tx, categoryId);
    if (!category) {
      throw appErrors.categoryNotFound();
    }
    const items = activeProductsOfCategory(tx, categoryId);
    if (items.length === 0) {
      throw appErrors.opnameEmpty();
    }
    const busy = productsInOpenOpnames(
      tx,
      items.map((i) => i.id),
    )[0];
    if (busy) {
      throw appErrors.opnameProductBusy(busy.productName);
    }
    const now = ctx.now().toISOString();
    const opname = insertOpname(tx, {
      categoryId,
      status: 'open',
      startedAt: now,
      userId: actor.id,
      createdAt: now,
      updatedAt: now,
    });
    insertOpnameItems(
      tx,
      items.map((i) => ({ opnameId: opname.id, productId: i.id, systemQtyAtStart: i.stock })),
    );
    return loadOpname(tx, opname.id);
  });
}

/** Saves counted quantities (null clears a count). Only for products in the session. */
export function updateOpnameItems(
  ctx: ServiceContext,
  id: string,
  input: UpdateOpnameItemsRequest,
): Opname {
  return ctx.db.transaction((tx) => {
    const opname = loadOpenOpname(tx, id);
    const known = new Set(opname.items.map((i) => i.productId));
    for (const item of input.items) {
      if (!known.has(item.productId)) {
        throw appErrors.opnameUnknownItem();
      }
      updateOpnameItem(tx, id, item.productId, { countedQty: item.countedQty });
    }
    return loadOpname(tx, id);
  });
}

/**
 * Completes a session: for each counted item, delta = counted - system_qty_at_start is applied
 * to current stock as an `opname` adjustment, valued at the product's cost_price now.
 * Uncounted items are left unchanged.
 */
export function completeOpname(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
): CompleteOpnameResponse {
  return ctx.db.transaction((tx) => {
    const opname = loadOpenOpname(tx, id);
    const now = ctx.now().toISOString();
    const products = new Map(
      findProductsByIds(
        tx,
        opname.items.map((i) => i.productId),
      ).map((p) => [p.id, p]),
    );
    const changed: string[] = [];
    for (const item of opname.items) {
      if (item.delta === null || item.delta === 0) continue;
      const adjustmentId = recordAdjustment(tx, {
        productId: item.productId,
        qtyChange: item.delta,
        reason: 'opname',
        note: `Opname ${opname.categoryName}`,
        costPrice: products.get(item.productId)?.costPrice ?? 0,
        userId: actor.id,
        createdAt: now,
      });
      updateOpnameItem(tx, id, item.productId, { adjustmentId });
      changed.push(item.productId);
    }
    updateOpname(tx, id, { status: 'completed', closedAt: now, closedBy: actor.id });
    return { opname: loadOpname(tx, id), warnings: stockWarnings(tx, changed) };
  });
}

/** Cancels a session: no stock change. */
export function cancelOpname(ctx: ServiceContext, actor: Actor, id: string): Opname {
  return ctx.db.transaction((tx) => {
    loadOpenOpname(tx, id);
    updateOpname(tx, id, {
      status: 'cancelled',
      closedAt: ctx.now().toISOString(),
      closedBy: actor.id,
    });
    return loadOpname(tx, id);
  });
}

/** Movement history, newest first, with the stock after each movement. */
export function listMovements(ctx: ServiceContext, query: MovementsQuery): MovementsResponse {
  const parsed = movementsQuerySchema.parse(query);
  const { rows, total } = searchMovements(ctx.db, {
    productId: parsed.productId,
    type: parsed.type,
    from: parsed.from ? startOfLocalDay(parsed.from).toISOString() : undefined,
    to: parsed.to ? startOfLocalDay(nextLocalDay(parsed.to)).toISOString() : undefined,
    limit: parsed.limit,
    offset: (parsed.page - 1) * parsed.limit,
  });
  const chains = stockChains(
    ctx.db,
    rows.map((r) => r.productId),
  );
  return {
    movements: rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productCode: r.productCode,
      productName: r.productName,
      baseUnit: r.baseUnit,
      unitChain: chains.get(r.productId) ?? [],
      type: r.type,
      qtyChange: r.qtyChange,
      refId: r.refId,
      refNumber: r.refNumber,
      reason: r.reason,
      note: r.note,
      userName: r.userName,
      balanceAfter: r.balanceAfter,
      createdAt: r.createdAt,
    })),
    total,
    page: parsed.page,
    limit: parsed.limit,
  };
}
