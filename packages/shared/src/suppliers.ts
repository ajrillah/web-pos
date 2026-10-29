import { z } from 'zod';
import { MAX_QTY, moneySchema } from './catalog';
import { debtPaymentMethodSchema } from './customers';
import { localDaySchemaPattern } from './dates';

// Contracts for suppliers, purchases (Stok Masuk), supplier payments, and payables.
// See docs/design.md 6.6.

export const MAX_PURCHASE_LINES = 200;

const nameSchema = z.string().trim().min(1).max(100);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

// --- Suppliers ---

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  /** Remaining debt (hutang): sum of `remaining` over completed purchases. */
  balance: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierRequestSchema = z.object({
  name: nameSchema,
  phone: optionalText(30).optional(),
  note: optionalText(200).optional(),
});
export type CreateSupplierRequest = z.input<typeof createSupplierRequestSchema>;
export type CreateSupplierInput = z.output<typeof createSupplierRequestSchema>;

export const updateSupplierRequestSchema = z
  .object({
    name: nameSchema.optional(),
    phone: optionalText(30).optional(),
    note: optionalText(200).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export type UpdateSupplierRequest = z.input<typeof updateSupplierRequestSchema>;
export type UpdateSupplierInput = z.output<typeof updateSupplierRequestSchema>;

export const suppliersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  /** Only suppliers with remaining debt. */
  withBalance: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SuppliersQuery = z.input<typeof suppliersQuerySchema>;
export type SuppliersQueryInput = z.output<typeof suppliersQuerySchema>;

export const suppliersResponseSchema = z.object({
  suppliers: z.array(supplierSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type SuppliersResponse = z.infer<typeof suppliersResponseSchema>;

export const supplierResponseSchema = z.object({ supplier: supplierSchema });
export type SupplierResponse = z.infer<typeof supplierResponseSchema>;

// --- Supplier-side voids ---

/** Reasons for voiding a purchase or a supplier payment. A note is required for `lainnya`. */
export const supplierVoidReasonSchema = z.enum(['salah_input', 'lainnya']);
export type SupplierVoidReason = z.infer<typeof supplierVoidReasonSchema>;

export const supplierVoidRequestSchema = z
  .object({
    reason: supplierVoidReasonSchema,
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.reason !== 'lainnya' || Boolean(v.note), { path: ['note'] });
export type SupplierVoidRequest = z.infer<typeof supplierVoidRequestSchema>;

// --- Purchases (Stok Masuk) ---

/** One purchased line: `qtyBase` in the stock unit; normal items: a multiple of the unit factor. */
export const purchaseLineInputSchema = z.object({
  productId: z.string().min(1),
  unitId: z.string().min(1),
  qtyBase: z.number().int().min(1).max(MAX_QTY),
  /** Buy price for one of the chosen unit (`factor` base units). */
  buyPrice: moneySchema,
  /** New product cost per `pricingFactor` base units. */
  newCostPrice: moneySchema,
});
export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;

export const createPurchaseRequestSchema = z.object({
  /** Client-generated UUID; a second request with the same id is rejected. */
  id: z.uuid(),
  supplierId: z.string().min(1),
  /** Purchase (invoice) date as a local day; defaults to today, never in the future. */
  date: z.string().regex(localDaySchemaPattern).optional(),
  note: optionalText(200).optional(),
  lines: z.array(purchaseLineInputSchema).min(1).max(MAX_PURCHASE_LINES),
  /** Paid now; recorded as the purchase's initial supplier payment. The rest is debt. */
  paidAmount: moneySchema,
  paidMethod: debtPaymentMethodSchema.default('cash'),
});
export type CreatePurchaseRequest = z.input<typeof createPurchaseRequestSchema>;
export type CreatePurchaseInput = z.output<typeof createPurchaseRequestSchema>;

export const purchaseStatusSchema = z.enum(['completed', 'voided']);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

export const purchaseItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  unitId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  unitName: z.string(),
  qtyBase: z.number().int(),
  unitFactor: z.number().int(),
  buyPrice: z.number().int(),
  subtotal: z.number().int(),
  pricingFactor: z.number().int(),
  oldCostPrice: z.number().int(),
  newCostPrice: z.number().int(),
});
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export const purchaseSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  date: z.string(),
  total: z.number().int(),
  paidAmount: z.number().int(),
  remaining: z.number().int(),
  status: purchaseStatusSchema,
  note: z.string().nullable(),
  userName: z.string(),
  itemCount: z.number().int(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
});
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>;

/** A payment's share of one purchase. */
export const purchasePaymentSchema = z.object({
  paymentId: z.string(),
  number: z.string(),
  method: debtPaymentMethodSchema,
  amount: z.number().int(),
  status: z.enum(['active', 'voided']),
  initial: z.boolean(),
  createdAt: z.string(),
});
export type PurchasePayment = z.infer<typeof purchasePaymentSchema>;

export const purchaseSchema = purchaseSummarySchema.extend({
  items: z.array(purchaseItemSchema),
  payments: z.array(purchasePaymentSchema),
});
export type Purchase = z.infer<typeof purchaseSchema>;

export const purchaseResponseSchema = z.object({ purchase: purchaseSchema });
export type PurchaseResponse = z.infer<typeof purchaseResponseSchema>;

/** A product whose cost price came from a voided purchase; the owner should review it. */
export const costReviewItemSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  costPrice: z.number().int(),
  pricingFactor: z.number().int(),
  baseUnit: z.string(),
});
export type CostReviewItem = z.infer<typeof costReviewItemSchema>;

export const voidPurchaseResponseSchema = z.object({
  purchase: purchaseSchema,
  /** Cost prices are not reverted; these products should be reviewed. */
  costReview: z.array(costReviewItemSchema),
});
export type VoidPurchaseResponse = z.infer<typeof voidPurchaseResponseSchema>;

export const purchasesQuerySchema = z.object({
  /** Local days `YYYY-MM-DD` of recording, inclusive; both optional. */
  from: z.string().regex(localDaySchemaPattern).optional(),
  to: z.string().regex(localDaySchemaPattern).optional(),
  supplierId: z.string().min(1).optional(),
  /** Purchase number or supplier name. */
  q: z.string().trim().max(100).optional(),
  status: z.enum(['completed', 'voided', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PurchasesQuery = z.input<typeof purchasesQuerySchema>;

export const purchasesResponseSchema = z.object({
  purchases: z.array(purchaseSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type PurchasesResponse = z.infer<typeof purchasesResponseSchema>;

export const costSuggestionQuerySchema = z.object({ productId: z.string().min(1) });

/** Inputs for the cost suggestions in Stok Masuk; the weighted average is computed per line. */
export const costSuggestionResponseSchema = z.object({
  productId: z.string(),
  costPrice: z.number().int(),
  pricingFactor: z.number().int(),
  stock: z.number().int(),
  /** Last active purchase's buy price as a cost per `pricingFactor` base units. */
  lastBuyCost: z.number().int().nullable(),
  lastBuyDate: z.string().nullable(),
});
export type CostSuggestionResponse = z.infer<typeof costSuggestionResponseSchema>;

// --- Payables (Daftar Hutang) ---

export const payablesQuerySchema = z.object({
  supplierId: z.string().min(1).optional(),
});
export type PayablesQuery = z.input<typeof payablesQuerySchema>;

export const payablesResponseSchema = z.object({
  /** Completed purchases with remaining debt, oldest first (the order payments fill them). */
  purchases: z.array(purchaseSummarySchema),
  totalRemaining: z.number().int(),
});
export type PayablesResponse = z.infer<typeof payablesResponseSchema>;

// --- Supplier payments ---

export const createSupplierPaymentRequestSchema = z.object({
  /** Client-generated UUID; a second request with the same id is rejected. */
  id: z.uuid(),
  supplierId: z.string().min(1),
  /** Ticked purchases; the payment fills the oldest first. */
  purchaseIds: z.array(z.string().min(1)).min(1).max(500),
  method: debtPaymentMethodSchema,
  /** Paid to the supplier; at most the ticked total. */
  amount: moneySchema.refine((v) => v > 0),
});
export type CreateSupplierPaymentRequest = z.infer<typeof createSupplierPaymentRequestSchema>;

export const supplierAllocationSchema = z.object({
  purchaseId: z.string(),
  purchaseNumber: z.string(),
  amount: z.number().int(),
});
export type SupplierAllocation = z.infer<typeof supplierAllocationSchema>;

export const supplierPaymentSchema = z.object({
  id: z.string(),
  number: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  method: debtPaymentMethodSchema,
  amount: z.number().int(),
  /** Set when this is a purchase's initial payment. */
  initialPurchaseId: z.string().nullable(),
  status: z.enum(['active', 'voided']),
  voidReason: z.string().nullable(),
  userName: z.string(),
  allocations: z.array(supplierAllocationSchema),
  createdAt: z.string(),
});
export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;

export const supplierPaymentResponseSchema = z.object({ payment: supplierPaymentSchema });
export type SupplierPaymentResponse = z.infer<typeof supplierPaymentResponseSchema>;

// --- Kartu Hutang ---

export const supplierLedgerEntrySchema = z.object({
  kind: z.enum(['purchase', 'payment']),
  /** Purchase or payment id. */
  refId: z.string(),
  number: z.string(),
  date: z.string(),
  /** Purchases add (positive); payments reduce (negative). */
  change: z.number().int(),
  /** Remaining debt after this entry. */
  balance: z.number().int(),
  voided: z.boolean(),
});
export type SupplierLedgerEntry = z.infer<typeof supplierLedgerEntrySchema>;

export const supplierLedgerResponseSchema = z.object({
  supplier: supplierSchema,
  /** Oldest first; voided entries are listed but do not change the balance. */
  entries: z.array(supplierLedgerEntrySchema),
});
export type SupplierLedgerResponse = z.infer<typeof supplierLedgerResponseSchema>;
