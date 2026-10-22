import {
  type CreateSaleRequest,
  type CreateSaleResponse,
  formatRupiah,
  type HoldSaleRequest,
  lineCostTotal,
  lineSubtotal,
  localDate,
  nextLocalDay,
  type Product,
  type ProductUnit,
  type ResumedLine,
  type ResumeHeldSaleResponse,
  roundSaleTotal,
  type Sale,
  type SaleLineInput,
  type SaleSummary,
  type SalesQuery,
  type SalesResponse,
  type StockWarning,
  salesQuerySchema,
  startOfLocalDay,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { activeAllocatedByReceivable } from '../repositories/customer-payments-repository';
import { findCustomerById } from '../repositories/customers-repository';
import {
  findReceivableBySale,
  insertReceivable,
  updateReceivable,
} from '../repositories/receivables-repository';
import {
  deleteHeldSales,
  findSaleById,
  insertSale,
  insertSaleItems,
  insertSalePayments,
  lastSaleNumber,
  listHeldSales,
  listSaleItems,
  listSalePayments,
  type SaleItemRow,
  type SaleWithCashier,
  saleIdExists,
  searchSales as searchSaleRows,
  updateSale,
} from '../repositories/sales-repository';
import { addToStockCache, insertMovement } from '../repositories/stock-repository';
import { type Actor, isApproved, type ServiceContext } from './context';
import { nextDocNumber } from './numbering';
import { productsByIds } from './product-service';
import { getSettings } from './settings-service';

// Rules: docs/design.md 4.1 (money), 4.3 (snapshots), 4.4 (stock), 6.1 (cashier, held sales).

/** Held sales older than this are deleted on server start. */
export const HELD_SALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface PricedLine {
  product: Product;
  unit: ProductUnit;
  qtyBase: number;
  subtotal: number;
  costTotal: number;
}

/** Loads current prices for the cart and computes each line; the client's numbers are not used. */
function priceLines(db: Executor, lines: SaleLineInput[]): PricedLine[] {
  const products = productsByIds(
    db,
    lines.map((l) => l.productId),
  );
  return lines.map((line) => {
    const product = products.get(line.productId);
    if (!product?.active) {
      throw appErrors.productUnavailable(product?.name ?? 'Barang');
    }
    const unit = product.units.find((u) => u.id === line.unitId);
    if (!unit) {
      throw appErrors.productUnavailable(product.name);
    }
    if (product.type === 'unit' && line.qtyBase % unit.factor !== 0) {
      throw appErrors.invalidQuantity(product.name);
    }
    return {
      product,
      unit,
      qtyBase: line.qtyBase,
      subtotal: lineSubtotal({
        qtyBase: line.qtyBase,
        unitPrice: unit.sellPrice,
        unitFactor: unit.factor,
      }),
      costTotal: lineCostTotal({
        qtyBase: line.qtyBase,
        costPrice: product.costPrice,
        pricingFactor: product.pricingFactor,
      }),
    };
  });
}

function itemRows(saleId: string, lines: PricedLine[], createdAt: string) {
  return lines.map((line, index) => ({
    saleId,
    lineNo: index + 1,
    productId: line.product.id,
    unitId: line.unit.id,
    productCode: line.product.code,
    productName: line.product.name,
    unitName: line.unit.name,
    qtyBase: line.qtyBase,
    unitFactor: line.unit.factor,
    unitPrice: line.unit.sellPrice,
    costPrice: line.product.costPrice,
    pricingFactor: line.product.pricingFactor,
    subtotal: line.subtotal,
    costTotal: line.costTotal,
    createdAt,
  }));
}

function toSummary(row: SaleWithCashier): SaleSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    cashierId: row.cashierId,
    cashierName: row.cashierName,
    subtotal: row.total - row.roundingAmount,
    roundingAmount: row.roundingAmount,
    total: row.total,
    paidTotal: row.paidTotal,
    changeAmount: row.changeAmount,
    debtAmount: row.debtAmount,
    itemCount: row.itemCount,
    customerId: row.customerId,
    customerName: row.customerName,
    customerBalanceAfter: row.customerBalanceAfter,
    receiptCount: row.receiptCount,
    completedAt: row.completedAt,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
  };
}

function toSales(db: Executor, rows: SaleWithCashier[]): Sale[] {
  const ids = rows.map((r) => r.id);
  const items = listSaleItems(db, ids);
  const payments = listSalePayments(db, ids);
  return rows.map((row) => ({
    ...toSummary(row),
    items: items
      .filter((i) => i.saleId === row.id)
      .map((i) => ({
        id: i.id,
        productId: i.productId,
        unitId: i.unitId,
        productCode: i.productCode,
        productName: i.productName,
        unitName: i.unitName,
        qtyBase: i.qtyBase,
        unitFactor: i.unitFactor,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
    payments: payments
      .filter((p) => p.saleId === row.id)
      .sort((a, b) => a.method.localeCompare(b.method))
      .map((p) => ({ method: p.method, amount: p.amount })),
  }));
}

function loadSale(db: Executor, id: string): Sale {
  const row = findSaleById(db, id);
  if (!row) {
    throw appErrors.saleNotFound();
  }
  return toSales(db, [row])[0] as Sale;
}

/**
 * Completes a sale in one transaction: sale, items (snapshots), payments, stock movements,
 * and the stock cache. The client UUID makes retries safe: a second request is rejected.
 */
export function createSale(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateSaleRequest,
): CreateSaleResponse {
  return ctx.db.transaction((tx) => {
    if (saleIdExists(tx, input.id)) {
      throw appErrors.duplicateSale();
    }
    const lines = priceLines(tx, input.lines);
    const sum = lines.reduce((acc, l) => acc + l.subtotal, 0);
    const { total, roundingAmount } = roundSaleTotal(sum, getSettings(tx).rounding);
    if (total !== input.expectedTotal) {
      throw appErrors.totalChanged(formatRupiah(total));
    }
    if (input.qris > total) {
      throw appErrors.qrisExceedsTotal();
    }
    const customer = input.customerId ? findCustomerById(tx, input.customerId) : undefined;
    if (input.customerId && !customer) {
      throw appErrors.customerNotFound();
    }
    if (customer && !customer.active) {
      throw appErrors.customerInactive();
    }
    const paidTotal = input.cash + input.qris;
    // Underpayment is kasbon for the chosen customer (docs/design.md 6.1, 6.7).
    const debtAmount = Math.max(0, total - paidTotal);
    if (debtAmount > 0 && !customer) {
      throw appErrors.underpaid();
    }

    const now = ctx.now().toISOString();
    insertSale(tx, {
      id: input.id,
      number: nextDocNumber('TRX', ctx.now(), (prefix) => lastSaleNumber(tx, prefix)),
      cashierId: actor.id,
      status: 'completed',
      total,
      roundingAmount,
      paidTotal,
      // QRIS never exceeds the total, so change always comes out of the cash.
      changeAmount: Math.max(0, paidTotal - total),
      debtAmount,
      customerId: customer?.id ?? null,
      customerBalanceAfter: customer ? customer.balance + debtAmount : null,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    insertSaleItems(tx, itemRows(input.id, lines, now));
    if (customer && debtAmount > 0) {
      insertReceivable(tx, {
        customerId: customer.id,
        saleId: input.id,
        amount: debtAmount,
        remaining: debtAmount,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
    }
    insertSalePayments(tx, [
      ...(input.cash > 0
        ? [{ saleId: input.id, method: 'cash' as const, amount: input.cash }]
        : []),
      ...(input.qris > 0
        ? [{ saleId: input.id, method: 'qris' as const, amount: input.qris }]
        : []),
    ]);
    for (const line of lines) {
      insertMovement(tx, {
        productId: line.product.id,
        qtyChange: -line.qtyBase,
        type: 'sale',
        refId: input.id,
        userId: actor.id,
        createdAt: now,
      });
      addToStockCache(tx, line.product.id, -line.qtyBase);
    }

    // Negative stock is allowed; report it so the cashier sees a warning.
    const after = productsByIds(
      tx,
      lines.map((l) => l.product.id),
    );
    const warnings: StockWarning[] = [...after.values()]
      .filter((p) => p.stock < 0)
      .map((p) => ({
        productId: p.id,
        productName: p.name,
        stock: p.stock,
        baseUnit: p.baseUnit,
      }));
    return { sale: loadSale(tx, input.id), warnings };
  });
}

export function getSale(ctx: ServiceContext, id: string): Sale {
  return loadSale(ctx.db, id);
}

/** Completed and voided sales for a local date range (default today), newest first. */
export function searchSales(ctx: ServiceContext, query: SalesQuery): SalesResponse {
  const parsed = salesQuerySchema.parse(query);
  const today = localDate(ctx.now());
  const from = parsed.from ?? today;
  const to = parsed.to ?? from;
  const { rows, total } = searchSaleRows(ctx.db, {
    from: startOfLocalDay(from).toISOString(),
    to: startOfLocalDay(nextLocalDay(to)).toISOString(),
    q: parsed.q || undefined,
    status: parsed.status === 'all' ? undefined : parsed.status,
    limit: parsed.limit,
    offset: (parsed.page - 1) * parsed.limit,
  });
  return { sales: rows.map(toSummary), total, page: parsed.page, limit: parsed.limit };
}

// --- Held sales (Tahan) ---

/** Stores the cart as a held sale: no number, no stock change, prices as of now. */
export function holdSale(ctx: ServiceContext, actor: Actor, input: HoldSaleRequest): Sale {
  return ctx.db.transaction((tx) => {
    if (saleIdExists(tx, input.id)) {
      throw appErrors.duplicateSale();
    }
    const lines = priceLines(tx, input.lines);
    const sum = lines.reduce((acc, l) => acc + l.subtotal, 0);
    const { total, roundingAmount } = roundSaleTotal(sum, getSettings(tx).rounding);
    const now = ctx.now().toISOString();
    insertSale(tx, {
      id: input.id,
      number: null,
      cashierId: actor.id,
      status: 'held',
      total,
      roundingAmount,
      createdAt: now,
      updatedAt: now,
    });
    insertSaleItems(tx, itemRows(input.id, lines, now));
    return loadSale(tx, input.id);
  });
}

export function listHeld(ctx: ServiceContext): Sale[] {
  return toSales(ctx.db, listHeldSales(ctx.db));
}

function findHeld(db: Executor, id: string): SaleWithCashier {
  const row = findSaleById(db, id);
  if (row?.status !== 'held') {
    throw appErrors.heldSaleNotFound();
  }
  return row;
}

/**
 * Takes a held sale back into the cart: lines get current prices (the held price is returned
 * for the warning), lines whose product or unit was deactivated are dropped and named, and the
 * held record is removed. Taking it back is not a deletion, so it is not audit-logged.
 */
export function resumeHeldSale(ctx: ServiceContext, id: string): ResumeHeldSaleResponse {
  return ctx.db.transaction((tx) => {
    findHeld(tx, id);
    const items = listSaleItems(tx, [id]);
    const products = productsByIds(
      tx,
      items.map((i) => i.productId),
    );
    const lines: ResumedLine[] = [];
    const removed: string[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      const unit = product?.active ? product.units.find((u) => u.id === item.unitId) : undefined;
      const wholeUnits = product?.type === 'bulk' || (unit && item.qtyBase % unit.factor === 0);
      if (!product || !unit || !wholeUnits) {
        removed.push(item.productName);
        continue;
      }
      lines.push({
        product,
        unitId: unit.id,
        qtyBase: item.qtyBase,
        heldUnitPrice: item.unitPrice,
      });
    }
    deleteHeldSales(tx, [id]);
    return { lines, removed };
  });
}

const heldSnapshot = (row: SaleWithCashier, items: SaleItemRow[]) => ({
  cashierId: row.cashierId,
  total: row.total,
  createdAt: row.createdAt,
  items: items
    .filter((i) => i.saleId === row.id)
    .map((i) => ({
      productCode: i.productCode,
      productName: i.productName,
      unitName: i.unitName,
      qtyBase: i.qtyBase,
    })),
});

/** Deletes held sales with an audit row each (docs/design.md 6.1). */
function deleteHeldWithAudit(
  db: Executor,
  rows: SaleWithCashier[],
  userId: string | null,
  action: 'delete' | 'auto_delete',
): number {
  const items = listSaleItems(
    db,
    rows.map((r) => r.id),
  );
  for (const row of rows) {
    insertAudit(db, {
      userId,
      entity: 'held_sale',
      entityId: row.id,
      action,
      oldValue: heldSnapshot(row, items),
    });
  }
  deleteHeldSales(
    db,
    rows.map((r) => r.id),
  );
  return rows.length;
}

export function deleteHeldSale(ctx: ServiceContext, actor: Actor, id: string): number {
  return ctx.db.transaction((tx) =>
    deleteHeldWithAudit(tx, [findHeld(tx, id)], actor.id, 'delete'),
  );
}

/** Deletes held sales created before local day `day` (the ones labeled "kemarin"). */
export function deleteHeldSalesBefore(ctx: ServiceContext, actor: Actor, day: string): number {
  return ctx.db.transaction((tx) =>
    deleteHeldWithAudit(
      tx,
      listHeldSales(tx, startOfLocalDay(day).toISOString()),
      actor.id,
      'delete',
    ),
  );
}

/** Server start: deletes held sales older than 7 days (audit action `auto_delete`, no user). */
export function deleteExpiredHeldSales(ctx: ServiceContext): number {
  const cutoff = new Date(ctx.now().getTime() - HELD_SALE_MAX_AGE_MS).toISOString();
  return ctx.db.transaction((tx) =>
    deleteHeldWithAudit(tx, listHeldSales(tx, cutoff), null, 'auto_delete'),
  );
}

const voidSnapshot = (row: SaleWithCashier) => ({
  number: row.number,
  total: row.total,
  debtAmount: row.debtAmount,
  customerId: row.customerId,
  status: row.status,
});

/**
 * Voids a completed sale (owner approval for cashiers): stock comes back through `void`
 * movements and its kasbon is voided. Refused while the kasbon has active payments.
 * Audit-logged with the approving owner.
 */
export function voidSale(ctx: ServiceContext, actor: Actor, id: string, reason: string): Sale {
  if (!isApproved(actor)) {
    throw appErrors.ownerApprovalRequired();
  }
  return ctx.db.transaction((tx) => {
    const row = findSaleById(tx, id);
    if (!row) {
      throw appErrors.saleNotFound();
    }
    if (row.status !== 'completed') {
      throw appErrors.saleNotVoidable();
    }
    const receivable = findReceivableBySale(tx, id);
    if (receivable && activeAllocatedByReceivable(tx, [receivable.id]).size > 0) {
      throw appErrors.saleHasPayments();
    }
    const now = ctx.now().toISOString();
    updateSale(tx, id, { status: 'voided', voidedAt: now, voidedBy: actor.id, voidReason: reason });
    for (const item of listSaleItems(tx, [id])) {
      insertMovement(tx, {
        productId: item.productId,
        qtyChange: item.qtyBase,
        type: 'void',
        refId: id,
        userId: actor.id,
        createdAt: now,
      });
      addToStockCache(tx, item.productId, item.qtyBase);
    }
    if (receivable) {
      // Remaining stays as recorded; the void status takes it out of every balance.
      updateReceivable(tx, receivable.id, { status: 'void' });
    }
    insertAudit(tx, {
      userId: actor.id,
      approvedBy: actor.approvedBy ?? null,
      entity: 'sale',
      entityId: id,
      action: 'void',
      oldValue: voidSnapshot(row),
      newValue: { status: 'voided', reason },
      createdAt: now,
    });
    return loadSale(tx, id);
  });
}
