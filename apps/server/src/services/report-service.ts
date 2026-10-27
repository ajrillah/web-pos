import {
  type ActivityReport,
  type CashDay,
  type CashReport,
  type CategoriesReport,
  type DebtsReport,
  type LossesReport,
  localDate,
  localDaysBetween,
  MAX_REPORT_DAYS,
  mulDivRoundHalfUp,
  nextLocalDay,
  type ProductSalesRow,
  type ProductsReport,
  type ReportQuery,
  ratioBasisPoints,
  reportQuerySchemas,
  type StockValueReport,
  type StockValueRow,
  type SummaryReport,
  startOfLocalDay,
  type UnitChainItem,
} from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import {
  activeProductSales,
  auditInRange,
  entityNames,
  lossesInRange,
  openPayablesBySupplier,
  openReceivablesByCustomer,
  type ProductSalesRaw,
  paymentsMoney,
  type Range,
  salesByCategory,
  salesInRange,
  salesMoney,
  soldProducts,
  stockedProducts,
} from '../repositories/reports-repository';
import { describeAudit } from './activity-descriptions';
import type { ServiceContext } from './context';
import { stockChains } from './product-service';

// Laporan (docs/design.md 6.8). Sales reports count completed sales only, on their sale date, so a
// sale voided later disappears from its original day. Cash reports follow the date money moved.

export interface Period extends Range {
  fromDay: string;
  toDay: string;
  days: string[];
}

/** Local days `from`..`to` (default today) with their UTC bounds. */
export function resolvePeriod(
  ctx: ServiceContext,
  query: { from?: string | undefined; to?: string | undefined },
): Period {
  const today = localDate(ctx.now());
  const fromDay = query.from ?? query.to ?? today;
  const toDay = query.to ?? fromDay;
  if (toDay < fromDay) throw appErrors.invalidPeriod();
  const days = localDaysBetween(fromDay, toDay);
  if (days.length > MAX_REPORT_DAYS) throw appErrors.periodTooLong(MAX_REPORT_DAYS);
  return {
    fromDay,
    toDay,
    days,
    from: startOfLocalDay(fromDay).toISOString(),
    to: startOfLocalDay(nextLocalDay(toDay)).toISOString(),
  };
}

const dayOf = (iso: string) => localDate(new Date(iso));
const inRange = (iso: string | null, { from, to }: Range) =>
  iso !== null && iso >= from && iso < to;
const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((s, r) => s + pick(r), 0);

export function summaryReport(ctx: ServiceContext, query: ReportQuery<'summary'>): SummaryReport {
  const q = reportQuerySchemas.summary.parse(query);
  const period = resolvePeriod(ctx, q);
  const rows = salesInRange(ctx.db, period);
  const valid = rows.filter((r) => r.status === 'completed');
  const voided = rows.filter((r) => r.status === 'voided');
  const byDay = new Map(
    period.days.map((day) => [day, { day, transactions: 0, revenue: 0, cost: 0, profit: 0 }]),
  );
  for (const r of valid) {
    const entry = byDay.get(dayOf(r.completed_at));
    if (!entry) continue;
    entry.transactions += 1;
    entry.revenue += r.total;
    entry.cost += r.cost;
    entry.profit += r.total - r.cost;
  }
  const revenue = sum(valid, (r) => r.total);
  const cost = sum(valid, (r) => r.cost);
  return {
    from: period.fromDay,
    to: period.toDay,
    totals: {
      transactions: valid.length,
      itemsSubtotal: sum(valid, (r) => r.items_subtotal),
      roundingAmount: sum(valid, (r) => r.rounding_amount),
      revenue,
      cost,
      profit: revenue - cost,
      marginBp: ratioBasisPoints(revenue - cost, revenue),
      kasbon: sum(valid, (r) => r.debt_amount),
    },
    days: [...byDay.values()],
    voided: { count: voided.length, total: sum(voided, (r) => r.total) },
  };
}

export function categoriesReport(
  ctx: ServiceContext,
  query: ReportQuery<'categories'>,
): CategoriesReport {
  const q = reportQuerySchemas.categories.parse(query);
  const period = resolvePeriod(ctx, q);
  const rows = salesByCategory(ctx.db, period, q.categoryId);
  // Share is of every category's revenue, also when one category is shown.
  const allRevenue = q.categoryId
    ? sum(salesByCategory(ctx.db, period), (r) => r.revenue)
    : sum(rows, (r) => r.revenue);
  const revenue = sum(rows, (r) => r.revenue);
  const cost = sum(rows, (r) => r.cost);
  return {
    from: period.fromDay,
    to: period.toDay,
    categoryId: q.categoryId ?? null,
    rows: rows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      revenue: r.revenue,
      cost: r.cost,
      profit: r.revenue - r.cost,
      marginBp: ratioBasisPoints(r.revenue - r.cost, r.revenue),
      shareBp: ratioBasisPoints(r.revenue, allRevenue),
    })),
    totals: {
      revenue,
      cost,
      profit: revenue - cost,
      marginBp: ratioBasisPoints(revenue - cost, revenue),
    },
  };
}

const toProductRow =
  (chains: Map<string, UnitChainItem[]>) =>
  (r: ProductSalesRaw): ProductSalesRow => ({
    productId: r.product_id,
    productCode: r.product_code,
    productName: r.product_name,
    categoryName: r.category_name,
    baseUnit: r.base_unit,
    unitChain: chains.get(r.product_id) ?? [],
    qtyBase: r.qty_base,
    revenue: r.revenue,
    cost: r.cost,
    profit: r.revenue - r.cost,
    stock: r.stock,
  });

export function productsReport(
  ctx: ServiceContext,
  query: ReportQuery<'products'>,
): ProductsReport {
  const q = reportQuerySchemas.products.parse(query);
  const period = resolvePeriod(ctx, q);
  const sold = soldProducts(ctx.db, period, q.categoryId).sort(
    (a, b) => b.revenue - a.revenue || a.product_name.localeCompare(b.product_name),
  );
  const slow = activeProductSales(ctx.db, period, q.categoryId).sort(
    (a, b) =>
      a.qty_base - b.qty_base ||
      a.revenue - b.revenue ||
      a.product_name.localeCompare(b.product_name),
  );
  const top = sold.slice(0, q.limit);
  const slowest = slow.slice(0, q.limit);
  const row = toProductRow(
    stockChains(
      ctx.db,
      [...top, ...slowest].map((r) => r.product_id),
    ),
  );
  return {
    from: period.fromDay,
    to: period.toDay,
    categoryId: q.categoryId ?? null,
    top: top.map(row),
    slow: slowest.map(row),
    soldProducts: new Set(sold.map((r) => r.product_id)).size,
  };
}

export function stockValueReport(
  ctx: ServiceContext,
  query: ReportQuery<'stock-value'>,
): StockValueReport {
  const q = reportQuerySchemas['stock-value'].parse(query);
  const stocked = stockedProducts(ctx.db, q.categoryId);
  const chains = stockChains(
    ctx.db,
    stocked.map((r) => r.product_id),
  );
  const all: StockValueRow[] = stocked.map((r) => ({
    productId: r.product_id,
    productCode: r.product_code,
    productName: r.product_name,
    categoryName: r.category_name,
    baseUnit: r.base_unit,
    unitChain: chains.get(r.product_id) ?? [],
    active: r.active === 1,
    stock: r.stock,
    costPrice: r.cost_price,
    pricingFactor: r.pricing_factor,
    // Negative stock counts as 0.
    value: r.stock > 0 ? mulDivRoundHalfUp(r.stock, r.cost_price, r.pricing_factor) : 0,
  }));
  const rows = all
    .filter((r) => r.stock > 0)
    .sort((a, b) => b.value - a.value || a.productName.localeCompare(b.productName));
  return {
    categoryId: q.categoryId ?? null,
    rows,
    negatives: all
      .filter((r) => r.stock < 0)
      .sort((a, b) => a.stock - b.stock || a.productName.localeCompare(b.productName)),
    totals: { value: sum(rows, (r) => r.value), items: rows.length },
  };
}

const emptyCash = (): Omit<CashDay, 'day'> => ({
  salesCash: 0,
  salesQris: 0,
  kasbonCash: 0,
  kasbonQris: 0,
  supplierCash: 0,
  supplierQris: 0,
  voidCash: 0,
  voidQris: 0,
  netCash: 0,
  netQris: 0,
});

/**
 * Money per local day: a sale's money counts on its sale day and a void refunds it on the void
 * day; customer and supplier payments likewise (docs/design.md 6.8).
 */
export function cashReport(ctx: ServiceContext, query: ReportQuery<'cash'>): CashReport {
  const q = reportQuerySchemas.cash.parse(query);
  const period = resolvePeriod(ctx, q);
  const days = new Map(period.days.map((day) => [day, { day, ...emptyCash() }]));
  const at = (iso: string) => days.get(dayOf(iso));

  for (const s of salesMoney(ctx.db, period)) {
    // Change is always given from cash.
    const cash = s.cash - s.change_amount;
    const sold = inRange(s.completed_at, period) ? at(s.completed_at) : undefined;
    if (sold) {
      sold.salesCash += cash;
      sold.salesQris += s.qris;
    }
    const refunded =
      s.status === 'voided' && inRange(s.voided_at, period) ? at(s.voided_at as string) : undefined;
    if (refunded) {
      refunded.voidCash -= cash;
      refunded.voidQris -= s.qris;
    }
  }
  for (const [kind, sign] of [
    ['customer', 1],
    ['supplier', -1],
  ] as const) {
    for (const p of paymentsMoney(ctx.db, kind, period)) {
      const paid = inRange(p.created_at, period) ? at(p.created_at) : undefined;
      if (paid) {
        const key = kind === 'customer' ? 'kasbon' : 'supplier';
        if (p.method === 'cash') paid[`${key}Cash`] += p.amount;
        else paid[`${key}Qris`] += p.amount;
      }
      const reversed =
        p.status === 'voided' && inRange(p.voided_at, period)
          ? at(p.voided_at as string)
          : undefined;
      if (reversed) {
        if (p.method === 'cash') reversed.voidCash -= sign * p.amount;
        else reversed.voidQris -= sign * p.amount;
      }
    }
  }
  const rows = [...days.values()].map((d) => ({
    ...d,
    netCash: d.salesCash + d.kasbonCash - d.supplierCash + d.voidCash,
    netQris: d.salesQris + d.kasbonQris - d.supplierQris + d.voidQris,
  }));
  const totals = emptyCash();
  for (const row of rows) {
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key];
  }
  return { from: period.fromDay, to: period.toDay, days: rows, totals };
}

/** Open kasbon per customer and open debt per supplier, as of now. */
export function debtsReport(ctx: ServiceContext, query: ReportQuery<'debts'>): DebtsReport {
  reportQuerySchemas.debts.parse(query);
  const party = (r: {
    id: string;
    name: string;
    balance: number;
    open_count: number;
    oldest_at: string;
  }) => ({
    id: r.id,
    name: r.name,
    balance: r.balance,
    openCount: r.open_count,
    oldestAt: r.oldest_at,
  });
  const customers = openReceivablesByCustomer(ctx.db).map(party);
  const suppliers = openPayablesBySupplier(ctx.db).map(party);
  return {
    receivables: { total: sum(customers, (c) => c.balance), customers },
    payables: { total: sum(suppliers, (s) => s.balance), suppliers },
  };
}

/** Adjustments that removed stock, valued at the cost recorded with each adjustment. */
export function lossesReport(ctx: ServiceContext, query: ReportQuery<'losses'>): LossesReport {
  const q = reportQuerySchemas.losses.parse(query);
  const period = resolvePeriod(ctx, q);
  const rows = lossesInRange(ctx.db, period, q.categoryId).map((r) => ({
    adjustmentId: r.id,
    createdAt: r.created_at,
    productCode: r.product_code,
    productName: r.product_name,
    categoryName: r.category_name,
    baseUnit: r.base_unit,
    qtyBase: -r.qty_change,
    reason: r.reason,
    note: r.note,
    value: mulDivRoundHalfUp(-r.qty_change, r.cost_price, r.pricing_factor),
    userName: r.user_name,
  }));
  const reasons = new Map<
    LossesReport['byReason'][number]['reason'],
    { count: number; value: number }
  >();
  for (const r of rows) {
    const entry = reasons.get(r.reason) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += r.value;
    reasons.set(r.reason, entry);
  }
  return {
    from: period.fromDay,
    to: period.toDay,
    categoryId: q.categoryId ?? null,
    byReason: [...reasons.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.value - a.value),
    rows,
    totals: { count: rows.length, value: sum(rows, (r) => r.value) },
  };
}

/** Audit log rows (voids on their void date, approvals, failed PINs, master data changes). */
export function activityReport(
  ctx: ServiceContext,
  query: ReportQuery<'activity'>,
): ActivityReport {
  const q = reportQuerySchemas.activity.parse(query);
  const period = resolvePeriod(ctx, q);
  const { rows, total } = auditInRange(ctx.db, period, {
    limit: q.limit,
    offset: (q.page - 1) * q.limit,
  });
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.entity_id);
    const purchaseId = r.new_value?.match(/"purchaseId":"([^"]+)"/)?.[1];
    if (purchaseId) ids.add(purchaseId);
  }
  const names = entityNames(ctx.db, [...ids]);
  return {
    from: period.fromDay,
    to: period.toDay,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userName: r.user_name,
      approvedByName: r.approved_by_name,
      entity: r.entity,
      action: r.action,
      description: describeAudit(
        {
          entity: r.entity,
          entityId: r.entity_id,
          action: r.action,
          oldValue: r.old_value,
          newValue: r.new_value,
        },
        names,
      ),
    })),
    total,
    page: q.page,
    limit: q.limit,
  };
}

export const reportBuilders = {
  summary: summaryReport,
  categories: categoriesReport,
  products: productsReport,
  'stock-value': stockValueReport,
  cash: cashReport,
  debts: debtsReport,
  losses: lossesReport,
  activity: activityReport,
};
