import { z } from 'zod';
import { adjustmentReasonSchema } from './catalog';
import { localDaySchemaPattern } from './dates';

// Contracts for Laporan (owner PIN). See docs/design.md 6.8: voided sales leave sales reports
// on their original date; cash reports follow the date money moved; activity uses the void date.

export const reportTypeSchema = z.enum([
  'summary',
  'categories',
  'products',
  'stock-value',
  'cash',
  'debts',
  'losses',
  'activity',
]);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const REPORT_LABELS: Record<ReportType, string> = {
  summary: 'Penjualan & Laba',
  categories: 'Per Kategori',
  products: 'Barang Terlaris & Lambat',
  'stock-value': 'Nilai Stok',
  cash: 'Kas',
  debts: 'Piutang & Hutang',
  losses: 'Kerugian Stok',
  activity: 'Aktivitas',
};

/** Reports over a period of local days; the others are a snapshot of now. */
export const DATED_REPORTS: readonly ReportType[] = [
  'summary',
  'categories',
  'products',
  'cash',
  'losses',
  'activity',
];
/** Product-based reports take a category filter; the others refuse it. */
export const CATEGORY_REPORTS: readonly ReportType[] = [
  'categories',
  'products',
  'stock-value',
  'losses',
];

/** Longest period one report covers. */
export const MAX_REPORT_DAYS = 366;

const day = z.string().regex(localDaySchemaPattern);
const categoryId = z.string().min(1).optional();

/** Query of one report type; unknown keys (e.g. a category on a cash report) are refused. */
export const reportQuerySchemas = {
  summary: z.strictObject({ from: day.optional(), to: day.optional() }),
  categories: z.strictObject({ from: day.optional(), to: day.optional(), categoryId }),
  products: z.strictObject({
    from: day.optional(),
    to: day.optional(),
    categoryId,
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  'stock-value': z.strictObject({ categoryId }),
  cash: z.strictObject({ from: day.optional(), to: day.optional() }),
  debts: z.strictObject({}),
  losses: z.strictObject({ from: day.optional(), to: day.optional(), categoryId }),
  activity: z.strictObject({
    from: day.optional(),
    to: day.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }),
} as const satisfies Record<ReportType, z.ZodType>;

export type ReportQuery<T extends ReportType> = z.input<(typeof reportQuerySchemas)[T]>;

export const exportFormatSchema = z.enum(['pdf', 'xlsx']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

const int = z.number().int();
const period = { from: z.string(), to: z.string() };

// --- Sales & profit ---

export const salesTotalsSchema = z.object({
  transactions: int,
  /** Sum of line subtotals, before rounding. */
  itemsSubtotal: int,
  roundingAmount: int,
  /** Omzet: sales totals after rounding. */
  revenue: int,
  cost: int,
  /** revenue - cost. */
  profit: int,
  /** Profit / revenue in basis points; null without revenue. */
  marginBp: int.nullable(),
  /** Part of the revenue still owed as kasbon at sale time. */
  kasbon: int,
});
export type SalesTotals = z.infer<typeof salesTotalsSchema>;

export const salesDaySchema = z.object({
  day: z.string(),
  transactions: int,
  revenue: int,
  cost: int,
  profit: int,
});

export const summaryReportSchema = z.object({
  ...period,
  totals: salesTotalsSchema,
  days: z.array(salesDaySchema),
  /** Sales of the period that were voided (not counted above). */
  voided: z.object({ count: int, total: int }),
});
export type SummaryReport = z.infer<typeof summaryReportSchema>;

// --- Per category ---

export const categoryRowSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  revenue: int,
  cost: int,
  profit: int,
  marginBp: int.nullable(),
  /** Share of all categories' revenue in basis points. */
  shareBp: int.nullable(),
});
export type CategoryRow = z.infer<typeof categoryRowSchema>;

export const categoriesReportSchema = z.object({
  ...period,
  categoryId: z.string().nullable(),
  rows: z.array(categoryRowSchema),
  totals: z.object({ revenue: int, cost: int, profit: int, marginBp: int.nullable() }),
});
export type CategoriesReport = z.infer<typeof categoriesReportSchema>;

// --- Products ---

export const productSalesRowSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  baseUnit: z.string(),
  /** Sold, in base units. */
  qtyBase: int,
  revenue: int,
  cost: int,
  profit: int,
  stock: int,
});
export type ProductSalesRow = z.infer<typeof productSalesRowSchema>;

export const productsReportSchema = z.object({
  ...period,
  categoryId: z.string().nullable(),
  /** Highest revenue first. */
  top: z.array(productSalesRowSchema),
  /** Active products, lowest quantity sold first (including none). */
  slow: z.array(productSalesRowSchema),
  soldProducts: int,
});
export type ProductsReport = z.infer<typeof productsReportSchema>;

// --- Stock value ---

export const stockValueRowSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  baseUnit: z.string(),
  active: z.boolean(),
  stock: int,
  costPrice: int,
  pricingFactor: int,
  /** round(stock * cost_price / pricing_factor); 0 for negative stock. */
  value: int,
});
export type StockValueRow = z.infer<typeof stockValueRowSchema>;

export const stockValueReportSchema = z.object({
  categoryId: z.string().nullable(),
  /** Products with stock above zero, highest value first. */
  rows: z.array(stockValueRowSchema),
  /** Products below zero; counted as 0 in the value. */
  negatives: z.array(stockValueRowSchema),
  totals: z.object({ value: int, items: int }),
});
export type StockValueReport = z.infer<typeof stockValueReportSchema>;

// --- Cash ---

export const cashDaySchema = z.object({
  day: z.string(),
  /** Cash received minus change, for sales of this day. */
  salesCash: int,
  salesQris: int,
  kasbonCash: int,
  kasbonQris: int,
  /** Paid to suppliers (positive = money out). */
  supplierCash: int,
  supplierQris: int,
  /** Net effect of voids made this day: refunds out, voided supplier payments back in. */
  voidCash: int,
  voidQris: int,
  /** salesCash + kasbonCash - supplierCash + voidCash. */
  netCash: int,
  netQris: int,
});
export type CashDay = z.infer<typeof cashDaySchema>;

export const cashReportSchema = z.object({
  ...period,
  days: z.array(cashDaySchema),
  totals: cashDaySchema.omit({ day: true }),
});
export type CashReport = z.infer<typeof cashReportSchema>;

// --- Receivables and payables ---

export const debtPartySchema = z.object({
  id: z.string(),
  name: z.string(),
  balance: int,
  openCount: int,
  /** Oldest open receivable or purchase. */
  oldestAt: z.string(),
});
export type DebtParty = z.infer<typeof debtPartySchema>;

export const debtsReportSchema = z.object({
  receivables: z.object({ total: int, customers: z.array(debtPartySchema) }),
  payables: z.object({ total: int, suppliers: z.array(debtPartySchema) }),
});
export type DebtsReport = z.infer<typeof debtsReportSchema>;

// --- Stock losses ---

export const lossRowSchema = z.object({
  adjustmentId: z.string(),
  createdAt: z.string(),
  productCode: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  baseUnit: z.string(),
  /** Lost quantity in base units (positive). */
  qtyBase: int,
  reason: adjustmentReasonSchema,
  note: z.string().nullable(),
  /** round(qty * cost_price at the adjustment / pricing_factor). */
  value: int,
  userName: z.string(),
});
export type LossRow = z.infer<typeof lossRowSchema>;

export const lossesReportSchema = z.object({
  ...period,
  categoryId: z.string().nullable(),
  byReason: z.array(z.object({ reason: adjustmentReasonSchema, count: int, value: int })),
  rows: z.array(lossRowSchema),
  totals: z.object({ count: int, value: int }),
});
export type LossesReport = z.infer<typeof lossesReportSchema>;

// --- Activity ---

export const activityRowSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  userName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  entity: z.string(),
  action: z.string(),
  /** Indonesian one-line description. */
  description: z.string(),
});
export type ActivityRow = z.infer<typeof activityRowSchema>;

export const activityReportSchema = z.object({
  ...period,
  rows: z.array(activityRowSchema),
  total: int,
  page: int,
  limit: int,
});
export type ActivityReport = z.infer<typeof activityReportSchema>;

export const reportResponseSchemas = {
  summary: summaryReportSchema,
  categories: categoriesReportSchema,
  products: productsReportSchema,
  'stock-value': stockValueReportSchema,
  cash: cashReportSchema,
  debts: debtsReportSchema,
  losses: lossesReportSchema,
  activity: activityReportSchema,
} as const satisfies Record<ReportType, z.ZodType>;

export type ReportResponse<T extends ReportType> = z.infer<(typeof reportResponseSchemas)[T]>;
