import {
  allocateOldestFirst,
  type CostReviewItem,
  type CostSuggestionResponse,
  type CreatePurchaseInput,
  type CreateSupplierPaymentRequest,
  costFromBuyPrice,
  lineSubtotal,
  localDate,
  nextLocalDay,
  type Purchase,
  type PurchaseSummary,
  type PurchasesQuery,
  type PurchasesResponse,
  purchasesQuerySchema,
  type SupplierPayment,
  startOfLocalDay,
  type VoidPurchaseResponse,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { updateProduct } from '../repositories/products-repository';
import {
  findPurchaseById,
  findPurchasesByIds,
  insertPurchase,
  insertPurchaseItems,
  lastPurchaseItemOf,
  lastPurchaseNumber,
  listPayables,
  listPurchaseItems,
  type PurchaseWithRefs,
  purchaseIdExists,
  searchPurchases as searchPurchaseRows,
  updatePurchase,
} from '../repositories/purchases-repository';
import { addToStockCache, insertMovement } from '../repositories/stock-repository';
import {
  findSupplierPaymentById,
  hasOtherActivePayments,
  insertSupplierAllocations,
  insertSupplierPayment,
  lastSupplierPaymentNumber,
  listPaymentsOfPurchase,
  listSupplierAllocations,
  supplierPaymentIdExists,
  updateSupplierPayment,
} from '../repositories/supplier-payments-repository';
import { findSupplierById } from '../repositories/suppliers-repository';
import { type Actor, isApproved, type ServiceContext } from './context';
import { nextDocNumber } from './numbering';
import { getProduct, productsByIds, syncUnitCosts } from './product-service';

// Rules: docs/design.md 6.6. Purchases and payments are not audit-logged (their tables are the
// record); voids and the cost price changes they make to products are.

export function toPurchaseSummary(row: PurchaseWithRefs): PurchaseSummary {
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    date: row.date,
    total: row.total,
    paidAmount: row.paidAmount,
    remaining: row.remaining,
    status: row.status,
    note: row.note,
    userName: row.userName,
    itemCount: row.itemCount,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  };
}

function loadPurchase(db: Executor, id: string): Purchase {
  const row = findPurchaseById(db, id);
  if (!row) {
    throw appErrors.purchaseNotFound();
  }
  return {
    ...toPurchaseSummary(row),
    items: listPurchaseItems(db, [id]).map((i) => ({
      id: i.id,
      productId: i.productId,
      unitId: i.unitId,
      productCode: i.productCode,
      productName: i.productName,
      unitName: i.unitName,
      qtyBase: i.qtyBase,
      unitFactor: i.unitFactor,
      buyPrice: i.buyPrice,
      subtotal: i.subtotal,
      pricingFactor: i.pricingFactor,
      oldCostPrice: i.oldCostPrice,
      newCostPrice: i.newCostPrice,
    })),
    payments: listPaymentsOfPurchase(db, id).map((p) => ({
      paymentId: p.paymentId,
      number: p.number,
      method: p.method,
      amount: p.amount,
      status: p.status,
      initial: p.initialPurchaseId === id,
      createdAt: p.createdAt,
    })),
  };
}

export function getPurchase(ctx: ServiceContext, id: string): Purchase {
  return loadPurchase(ctx.db, id);
}

/** Purchases newest first; optional local-day range of recording. */
export function searchPurchases(ctx: ServiceContext, query: PurchasesQuery): PurchasesResponse {
  const parsed = purchasesQuerySchema.parse(query);
  const { rows, total } = searchPurchaseRows(ctx.db, {
    from: parsed.from ? startOfLocalDay(parsed.from).toISOString() : undefined,
    to: parsed.to ? startOfLocalDay(nextLocalDay(parsed.to)).toISOString() : undefined,
    supplierId: parsed.supplierId,
    q: parsed.q || undefined,
    status: parsed.status === 'all' ? undefined : parsed.status,
    limit: parsed.limit,
    offset: (parsed.page - 1) * parsed.limit,
  });
  return {
    purchases: rows.map(toPurchaseSummary),
    total,
    page: parsed.page,
    limit: parsed.limit,
  };
}

/** Current cost, stock, and the last buy price (as a cost) for the Stok Masuk suggestions. */
export function costSuggestion(ctx: ServiceContext, productId: string): CostSuggestionResponse {
  const product = getProduct(ctx, productId);
  const last = lastPurchaseItemOf(ctx.db, productId);
  return {
    productId,
    costPrice: product.costPrice,
    pricingFactor: product.pricingFactor,
    stock: product.stock,
    lastBuyCost: last
      ? costFromBuyPrice(last.buyPrice, last.unitFactor, product.pricingFactor)
      : null,
    lastBuyDate: last?.purchaseDate ?? null,
  };
}

function insertPaymentWithAllocations(
  tx: Executor,
  ctx: ServiceContext,
  payment: {
    id: string;
    supplierId: string;
    method: 'cash' | 'qris';
    initialPurchaseId: string | null;
    userId: string;
  },
  allocations: { purchaseId: string; amount: number; remaining: number; paidAmount: number }[],
  now: string,
): void {
  insertSupplierPayment(tx, {
    ...payment,
    number: nextDocNumber('BYH', ctx.now(), (prefix) => lastSupplierPaymentNumber(tx, prefix)),
    amount: allocations.reduce((sum, a) => sum + a.amount, 0),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  insertSupplierAllocations(
    tx,
    allocations.map((a) => ({
      paymentId: payment.id,
      purchaseId: a.purchaseId,
      amount: a.amount,
      createdAt: now,
    })),
  );
  for (const a of allocations) {
    updatePurchase(tx, a.purchaseId, {
      remaining: a.remaining - a.amount,
      paidAmount: a.paidAmount + a.amount,
    });
  }
}

/**
 * Records a purchase in one transaction: purchase, items, `purchase` movements, the stock cache,
 * new cost prices, and the initial payment with its allocation. Changing a cost price needs
 * owner approval for cashiers.
 */
export function createPurchase(
  ctx: ServiceContext,
  actor: Actor,
  input: CreatePurchaseInput,
): Purchase {
  return ctx.db.transaction((tx) => {
    if (purchaseIdExists(tx, input.id)) {
      throw appErrors.duplicatePurchase();
    }
    const supplier = findSupplierById(tx, input.supplierId);
    if (!supplier) {
      throw appErrors.supplierNotFound();
    }
    if (!supplier.active) {
      throw appErrors.supplierInactive();
    }
    const today = localDate(ctx.now());
    const date = input.date ?? today;
    if (date > today) {
      throw appErrors.purchaseDateInFuture();
    }

    const products = productsByIds(
      tx,
      input.lines.map((l) => l.productId),
    );
    const seen = new Set<string>();
    const lines = input.lines.map((line) => {
      const product = products.get(line.productId);
      const unit = product?.units.find((u) => u.id === line.unitId);
      if (!product?.active || !unit) {
        throw appErrors.purchaseProductInactive(product?.name ?? 'Barang');
      }
      if (seen.has(product.id)) {
        throw appErrors.duplicatePurchaseLine(product.name);
      }
      seen.add(product.id);
      if (product.type === 'unit' && line.qtyBase % unit.factor !== 0) {
        throw appErrors.purchaseInvalidQuantity(product.name);
      }
      return {
        ...line,
        product,
        unit,
        subtotal: lineSubtotal({
          qtyBase: line.qtyBase,
          unitPrice: line.buyPrice,
          unitFactor: unit.factor,
        }),
      };
    });
    const costChanged = lines.filter((l) => l.newCostPrice !== l.product.costPrice);
    if (costChanged.length > 0 && !isApproved(actor)) {
      throw appErrors.ownerApprovalRequired();
    }
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
    if (input.paidAmount > total) {
      throw appErrors.paidExceedsTotal();
    }

    const now = ctx.now().toISOString();
    insertPurchase(tx, {
      id: input.id,
      number: nextDocNumber('BLI', ctx.now(), (prefix) => lastPurchaseNumber(tx, prefix)),
      supplierId: supplier.id,
      date,
      total,
      paidAmount: 0,
      remaining: total,
      status: 'completed',
      userId: actor.id,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
    insertPurchaseItems(
      tx,
      lines.map((l, index) => ({
        purchaseId: input.id,
        lineNo: index + 1,
        productId: l.product.id,
        unitId: l.unit.id,
        productCode: l.product.code,
        productName: l.product.name,
        unitName: l.unit.name,
        qtyBase: l.qtyBase,
        unitFactor: l.unit.factor,
        buyPrice: l.buyPrice,
        subtotal: l.subtotal,
        pricingFactor: l.product.pricingFactor,
        oldCostPrice: l.product.costPrice,
        newCostPrice: l.newCostPrice,
        createdAt: now,
      })),
    );
    for (const l of lines) {
      insertMovement(tx, {
        productId: l.product.id,
        qtyChange: l.qtyBase,
        type: 'purchase',
        refId: input.id,
        userId: actor.id,
        createdAt: now,
      });
      addToStockCache(tx, l.product.id, l.qtyBase);
    }
    // Cost price is product master data: the change is audit-logged with its purchase.
    for (const l of costChanged) {
      updateProduct(tx, l.product.id, { costPrice: l.newCostPrice });
      syncUnitCosts(tx, l.product.id, l.newCostPrice, l.product.pricingFactor);
      insertAudit(tx, {
        userId: actor.id,
        approvedBy: actor.approvedBy ?? null,
        entity: 'product',
        entityId: l.product.id,
        action: 'cost_from_purchase',
        oldValue: { costPrice: l.product.costPrice },
        newValue: { costPrice: l.newCostPrice, purchaseId: input.id },
      });
    }
    if (input.paidAmount > 0) {
      insertPaymentWithAllocations(
        tx,
        ctx,
        {
          id: crypto.randomUUID(),
          supplierId: supplier.id,
          method: input.paidMethod,
          initialPurchaseId: input.id,
          userId: actor.id,
        },
        [{ purchaseId: input.id, amount: input.paidAmount, remaining: total, paidAmount: 0 }],
        now,
      );
    }
    return loadPurchase(tx, input.id);
  });
}

/** Gives each allocation of a payment back to its purchase and marks the payment voided. */
function voidPaymentRows(
  tx: Executor,
  actor: Actor,
  payment: { id: string; number: string; amount: number },
  reason: string,
  now: string,
): void {
  const allocations = listSupplierAllocations(tx, [payment.id]);
  const purchases = new Map(
    findPurchasesByIds(
      tx,
      allocations.map((a) => a.purchaseId),
    ).map((p) => [p.id, p]),
  );
  for (const a of allocations) {
    const purchase = purchases.get(a.purchaseId);
    if (!purchase) continue;
    updatePurchase(tx, purchase.id, {
      remaining: purchase.remaining + a.amount,
      paidAmount: purchase.paidAmount - a.amount,
    });
  }
  updateSupplierPayment(tx, payment.id, {
    status: 'voided',
    voidedAt: now,
    voidedBy: actor.id,
    voidReason: reason,
  });
  insertAudit(tx, {
    userId: actor.id,
    approvedBy: actor.approvedBy ?? null,
    entity: 'supplier_payment',
    entityId: payment.id,
    action: 'void',
    oldValue: { number: payment.number, amount: payment.amount, status: 'active' },
    newValue: { status: 'voided', reason },
    createdAt: now,
  });
}

/**
 * Voids a purchase (owner approval for cashiers). Refused while a payment other than its
 * initial one is active. Voids the initial payment, reverses stock with `purchase_void`
 * movements, and keeps cost prices: the products whose cost it changed are returned for review.
 */
export function voidPurchase(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  reason: string,
): VoidPurchaseResponse {
  if (!isApproved(actor)) {
    throw appErrors.ownerApprovalRequired();
  }
  return ctx.db.transaction((tx) => {
    const purchase = loadPurchase(tx, id);
    if (purchase.status !== 'completed') {
      throw appErrors.purchaseNotVoidable();
    }
    if (hasOtherActivePayments(tx, id)) {
      throw appErrors.purchaseHasPayments();
    }
    const now = ctx.now().toISOString();
    for (const p of purchase.payments) {
      if (p.initial && p.status === 'active') {
        const payment = findSupplierPaymentById(tx, p.paymentId);
        if (payment) voidPaymentRows(tx, actor, payment, reason, now);
      }
    }
    for (const item of purchase.items) {
      insertMovement(tx, {
        productId: item.productId,
        qtyChange: -item.qtyBase,
        type: 'purchase_void',
        refId: id,
        userId: actor.id,
        createdAt: now,
      });
      addToStockCache(tx, item.productId, -item.qtyBase);
    }
    updatePurchase(tx, id, {
      status: 'voided',
      voidedAt: now,
      voidedBy: actor.id,
      voidReason: reason,
    });
    insertAudit(tx, {
      userId: actor.id,
      approvedBy: actor.approvedBy ?? null,
      entity: 'purchase',
      entityId: id,
      action: 'void',
      oldValue: { number: purchase.number, total: purchase.total, status: purchase.status },
      newValue: { status: 'voided', reason },
      createdAt: now,
    });

    const changed = purchase.items.filter((i) => i.newCostPrice !== i.oldCostPrice);
    const current = productsByIds(
      tx,
      changed.map((i) => i.productId),
    );
    const costReview: CostReviewItem[] = [...current.values()].map((p) => ({
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      costPrice: p.costPrice,
      pricingFactor: p.pricingFactor,
      baseUnit: p.baseUnit,
    }));
    return { purchase: loadPurchase(tx, id), costReview };
  });
}

// --- Supplier payments ---

function loadSupplierPayment(db: Executor, id: string): SupplierPayment {
  const row = findSupplierPaymentById(db, id);
  if (!row) {
    throw appErrors.supplierPaymentNotFound();
  }
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    method: row.method,
    amount: row.amount,
    initialPurchaseId: row.initialPurchaseId,
    status: row.status,
    voidReason: row.voidReason,
    userName: row.userName,
    allocations: listSupplierAllocations(db, [id]).map((a) => ({
      purchaseId: a.purchaseId,
      purchaseNumber: a.purchaseNumber,
      amount: a.amount,
    })),
    createdAt: row.createdAt,
  };
}

export function getSupplierPayment(ctx: ServiceContext, id: string): SupplierPayment {
  return loadSupplierPayment(ctx.db, id);
}

/**
 * Pays supplier debt against ticked purchases in one transaction, oldest first. The amount
 * cannot exceed the ticked total (no change: the store pays out).
 */
export function createSupplierPayment(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateSupplierPaymentRequest,
): SupplierPayment {
  return ctx.db.transaction((tx) => {
    if (supplierPaymentIdExists(tx, input.id)) {
      throw appErrors.duplicateSupplierPayment();
    }
    const supplier = findSupplierById(tx, input.supplierId);
    if (!supplier) {
      throw appErrors.supplierNotFound();
    }
    const ids = [...new Set(input.purchaseIds)];
    const ticked = listPayables(tx, { supplierId: supplier.id, ids });
    if (ticked.length !== ids.length) {
      throw appErrors.invalidPayables();
    }
    const tickedTotal = ticked.reduce((sum, p) => sum + p.remaining, 0);
    if (input.amount > tickedTotal) {
      throw appErrors.amountExceedsDebt();
    }
    const byId = new Map(ticked.map((p) => [p.id, p]));
    const allocations = allocateOldestFirst(ticked, input.amount).map((a) => {
      const purchase = byId.get(a.receivableId);
      return {
        purchaseId: a.receivableId,
        amount: a.amount,
        remaining: purchase?.remaining ?? 0,
        paidAmount: purchase?.paidAmount ?? 0,
      };
    });
    insertPaymentWithAllocations(
      tx,
      ctx,
      {
        id: input.id,
        supplierId: supplier.id,
        method: input.method,
        initialPurchaseId: null,
        userId: actor.id,
      },
      allocations,
      ctx.now().toISOString(),
    );
    return loadSupplierPayment(tx, input.id);
  });
}

/**
 * Voids a supplier payment (owner approval for cashiers), including a purchase's initial
 * payment: each allocated purchase gets its amount back as debt.
 */
export function voidSupplierPayment(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  reason: string,
): SupplierPayment {
  if (!isApproved(actor)) {
    throw appErrors.ownerApprovalRequired();
  }
  return ctx.db.transaction((tx) => {
    const payment = loadSupplierPayment(tx, id);
    if (payment.status !== 'active') {
      throw appErrors.supplierPaymentNotVoidable();
    }
    voidPaymentRows(tx, actor, payment, reason, ctx.now().toISOString());
    return loadSupplierPayment(tx, id);
  });
}
