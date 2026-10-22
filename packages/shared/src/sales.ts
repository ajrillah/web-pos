import { z } from 'zod';
import { MAX_QTY, moneySchema, productSchema } from './catalog';
import { localDaySchemaPattern } from './dates';
import { roundingModeSchema } from './money';

// Contracts for sales, held sales, receipts, and history. See docs/design.md 6.1-6.4 and 10.

export const MAX_SALE_LINES = 200;

export const saleStatusSchema = z.enum(['held', 'completed', 'voided']);
export type SaleStatus = z.infer<typeof saleStatusSchema>;

export const paymentMethodSchema = z.enum(['cash', 'qris']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** One cart line. `qtyBase` is in the product's stock unit; normal items: a multiple of the unit factor. */
export const saleLineInputSchema = z.object({
  productId: z.string().min(1),
  unitId: z.string().min(1),
  qtyBase: z.number().int().min(1).max(MAX_QTY),
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

const linesSchema = z.array(saleLineInputSchema).min(1).max(MAX_SALE_LINES);

export const createSaleRequestSchema = z.object({
  /** Client-generated UUID; a second request with the same id is rejected. */
  id: z.uuid(),
  lines: linesSchema,
  cash: moneySchema,
  qris: moneySchema,
  /** Rounded total the cashier saw; the server recomputes and refuses if it differs. */
  expectedTotal: moneySchema,
  /** Required for kasbon (paid < total); the shortfall becomes the customer's receivable. */
  customerId: z.string().min(1).optional(),
});
export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;

export const holdSaleRequestSchema = z.object({ id: z.uuid(), lines: linesSchema });
export type HoldSaleRequest = z.infer<typeof holdSaleRequestSchema>;

export const saleItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  unitId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  unitName: z.string(),
  qtyBase: z.number().int(),
  unitFactor: z.number().int(),
  unitPrice: z.number().int(),
  subtotal: z.number().int(),
});
export type SaleItem = z.infer<typeof saleItemSchema>;

export const salePaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().int(),
});
export type SalePayment = z.infer<typeof salePaymentSchema>;

export const saleSummarySchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  status: saleStatusSchema,
  cashierId: z.string(),
  cashierName: z.string(),
  /** Sum of line subtotals, before rounding. */
  subtotal: z.number().int(),
  roundingAmount: z.number().int(),
  /** After rounding. */
  total: z.number().int(),
  paidTotal: z.number().int(),
  changeAmount: z.number().int(),
  debtAmount: z.number().int(),
  itemCount: z.number().int(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  /** Customer's remaining kasbon right after the sale (receipt snapshot). */
  customerBalanceAfter: z.number().int().nullable(),
  receiptCount: z.number().int(),
  completedAt: z.string().nullable(),
  voidedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type SaleSummary = z.infer<typeof saleSummarySchema>;

export const saleSchema = saleSummarySchema.extend({
  items: z.array(saleItemSchema),
  payments: z.array(salePaymentSchema),
});
export type Sale = z.infer<typeof saleSchema>;

export const stockWarningSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  stock: z.number().int(),
  baseUnit: z.string(),
});
export type StockWarning = z.infer<typeof stockWarningSchema>;

export const createSaleResponseSchema = z.object({
  sale: saleSchema,
  /** Products whose stock went below zero; the sale is saved anyway. */
  warnings: z.array(stockWarningSchema),
});
export type CreateSaleResponse = z.infer<typeof createSaleResponseSchema>;

export const saleResponseSchema = z.object({ sale: saleSchema });
export type SaleResponse = z.infer<typeof saleResponseSchema>;

export const heldSalesResponseSchema = z.object({ heldSales: z.array(saleSchema) });
export type HeldSalesResponse = z.infer<typeof heldSalesResponseSchema>;

export const resumedLineSchema = z.object({
  product: productSchema,
  unitId: z.string(),
  qtyBase: z.number().int(),
  /** Unit price when the sale was held; differs from the current price if it changed. */
  heldUnitPrice: z.number().int(),
});
export type ResumedLine = z.infer<typeof resumedLineSchema>;

export const resumeHeldSaleResponseSchema = z.object({
  lines: z.array(resumedLineSchema),
  /** Names of products dropped because they or their unit were deactivated. */
  removed: z.array(z.string()),
});
export type ResumeHeldSaleResponse = z.infer<typeof resumeHeldSaleResponseSchema>;

export const deleteHeldSalesQuerySchema = z.object({
  /** Deletes held sales created before this local day ("kemarin" and older). */
  before: z.string().regex(localDaySchemaPattern),
});

export const deletedCountResponseSchema = z.object({ deleted: z.number().int() });
export type DeletedCountResponse = z.infer<typeof deletedCountResponseSchema>;

export const salesQuerySchema = z.object({
  /** Local days `YYYY-MM-DD`, inclusive; both default to today. */
  from: z.string().regex(localDaySchemaPattern).optional(),
  to: z.string().regex(localDaySchemaPattern).optional(),
  /** Sale number, product code, or product name. */
  q: z.string().trim().max(100).optional(),
  status: z.enum(['completed', 'voided', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SalesQuery = z.input<typeof salesQuerySchema>;

export const salesResponseSchema = z.object({
  sales: z.array(saleSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type SalesResponse = z.infer<typeof salesResponseSchema>;

export const receiptSavedResponseSchema = z.object({
  fileName: z.string(),
  folder: z.string(),
  /** True for every receipt after the first ("SALINAN"). */
  copy: z.boolean(),
});
export type ReceiptSavedResponse = z.infer<typeof receiptSavedResponseSchema>;

// --- Settings (read-only until Stage 5) ---

export const settingsSchema = z.object({
  storeName: z.string(),
  storeAddress: z.string(),
  storePhone: z.string(),
  receiptFooter: z.string(),
  rounding: roundingModeSchema,
  receiptWidth: z.enum(['58', '80']),
  receiptFolder: z.string(),
  autoLockMinutes: z.number().int(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsResponseSchema = z.object({ settings: settingsSchema });
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

/** Settings page (Profil Toko, PIN). Only the fields sent are changed. */
export const updateSettingsRequestSchema = z
  .object({
    storeName: z.string().trim().min(1).max(60),
    storeAddress: z.string().trim().max(120),
    storePhone: z.string().trim().max(30),
    receiptFooter: z.string().trim().max(120),
    rounding: roundingModeSchema,
    receiptWidth: z.enum(['58', '80']),
    receiptFolder: z.string().trim().min(1).max(260),
    autoLockMinutes: z.number().int().min(1).max(120),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/** Void a sale or a customer payment (owner approval for cashiers). */
export const voidRequestSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type VoidRequest = z.infer<typeof voidRequestSchema>;

// --- Cash helpers ---

const NOTES = [1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

/**
 * Quick cash amounts for the Bayar dialog: the exact total ("Uang pas") followed by the
 * smallest amounts above it that are whole multiples of a banknote, at most `count` in all.
 */
export function quickCashAmounts(total: number, count = 4): number[] {
  const above = new Set<number>();
  for (const note of NOTES) {
    const amount = Math.ceil(total / note) * note;
    if (amount > total) above.add(amount);
  }
  return [total, ...[...above].sort((a, b) => a - b)].slice(0, count);
}

/**
 * Quantity in the sell unit for display, e.g. `1,5` kg for 1500 g or `2` dus.
 * Integer math only; up to 3 decimals with a comma separator.
 */
export function formatUnitQty(qtyBase: number, unitFactor: number): string {
  const whole = Math.floor(qtyBase / unitFactor);
  const rest = qtyBase - whole * unitFactor;
  if (rest === 0) return String(whole);
  // Factors here are 1000 (bulk) or whole multiples; show thousandths without trailing zeros.
  const thousandths = Math.round((rest * 1000) / unitFactor);
  return `${whole},${String(thousandths).padStart(3, '0').replace(/0+$/, '')}`;
}
