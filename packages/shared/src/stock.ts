import { z } from 'zod';
import { adjustmentReasonSchema, MAX_QTY } from './catalog';
import { localDaySchemaPattern } from './dates';
import { stockWarningSchema } from './sales';

// Contracts for stock adjustments, opname sessions, and movement history. See docs/design.md 6.6.

export const ADJUSTMENT_REASON_LABELS: Record<z.infer<typeof adjustmentReasonSchema>, string> = {
  rusak: 'Rusak',
  kedaluwarsa: 'Kedaluwarsa',
  hilang: 'Hilang',
  opname: 'Opname',
  lainnya: 'Lainnya',
};

// --- Adjustments (Penyesuaian) ---

export const createAdjustmentRequestSchema = z
  .object({
    productId: z.string().min(1),
    /** Change in base units: negative removes stock, positive adds it. */
    qtyChange: z
      .number()
      .int()
      .min(-MAX_QTY)
      .max(MAX_QTY)
      .refine((v) => v !== 0),
    reason: adjustmentReasonSchema,
    note: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.reason !== 'lainnya' || Boolean(v.note), { path: ['note'] });
export type CreateAdjustmentRequest = z.input<typeof createAdjustmentRequestSchema>;
export type CreateAdjustmentInput = z.output<typeof createAdjustmentRequestSchema>;

export const adjustmentSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  qtyChange: z.number().int(),
  reason: adjustmentReasonSchema,
  note: z.string().nullable(),
  /** Product cost per `pricingFactor` base units when the adjustment was made. */
  costPrice: z.number().int(),
  pricingFactor: z.number().int(),
  userName: z.string(),
  createdAt: z.string(),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const createAdjustmentResponseSchema = z.object({
  adjustment: adjustmentSchema,
  /** The product is now below zero; the adjustment is saved anyway. */
  warnings: z.array(stockWarningSchema),
});
export type CreateAdjustmentResponse = z.infer<typeof createAdjustmentResponseSchema>;

export const adjustmentsQuerySchema = z.object({
  productId: z.string().min(1).optional(),
  reason: adjustmentReasonSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdjustmentsQuery = z.input<typeof adjustmentsQuerySchema>;

export const adjustmentsResponseSchema = z.object({
  adjustments: z.array(adjustmentSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type AdjustmentsResponse = z.infer<typeof adjustmentsResponseSchema>;

// --- Opname sessions ---

export const opnameStatusSchema = z.enum(['open', 'completed', 'cancelled']);
export type OpnameStatus = z.infer<typeof opnameStatusSchema>;

export const startOpnameRequestSchema = z.object({ categoryId: z.string().min(1) });
export type StartOpnameRequest = z.infer<typeof startOpnameRequestSchema>;

export const opnameSummarySchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  status: opnameStatusSchema,
  startedAt: z.string(),
  closedAt: z.string().nullable(),
  userName: z.string(),
  closedByName: z.string().nullable(),
  itemCount: z.number().int(),
  countedCount: z.number().int(),
});
export type OpnameSummary = z.infer<typeof opnameSummarySchema>;

export const opnameItemSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  type: z.enum(['unit', 'bulk']),
  baseUnit: z.string(),
  systemQtyAtStart: z.number().int(),
  /** Current cached stock (sales continue during the session). */
  currentStock: z.number().int(),
  countedQty: z.number().int().nullable(),
  /** counted - system at start; null until counted. */
  delta: z.number().int().nullable(),
});
export type OpnameItem = z.infer<typeof opnameItemSchema>;

export const opnameSchema = opnameSummarySchema.extend({ items: z.array(opnameItemSchema) });
export type Opname = z.infer<typeof opnameSchema>;

export const opnameResponseSchema = z.object({ opname: opnameSchema });
export type OpnameResponse = z.infer<typeof opnameResponseSchema>;

export const opnamesQuerySchema = z.object({
  status: z.enum(['open', 'completed', 'cancelled', 'all']).default('all'),
});
export type OpnamesQuery = z.input<typeof opnamesQuerySchema>;

export const opnamesResponseSchema = z.object({ opnames: z.array(opnameSummarySchema) });
export type OpnamesResponse = z.infer<typeof opnamesResponseSchema>;

/** Saves counts; `countedQty: null` clears a count. Items not sent are unchanged. */
export const updateOpnameItemsRequestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        countedQty: z.number().int().min(0).max(MAX_QTY).nullable(),
      }),
    )
    .min(1)
    .max(2000),
});
export type UpdateOpnameItemsRequest = z.infer<typeof updateOpnameItemsRequestSchema>;

export const completeOpnameResponseSchema = z.object({
  opname: opnameSchema,
  warnings: z.array(stockWarningSchema),
});
export type CompleteOpnameResponse = z.infer<typeof completeOpnameResponseSchema>;

// --- Movement history ---

export const movementTypeSchema = z.enum([
  'sale',
  'void',
  'purchase',
  'purchase_void',
  'adjustment',
]);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  sale: 'Penjualan',
  void: 'Batal jual',
  purchase: 'Stok masuk',
  purchase_void: 'Batal stok masuk',
  adjustment: 'Penyesuaian',
};

export const movementsQuerySchema = z.object({
  productId: z.string().min(1).optional(),
  type: movementTypeSchema.optional(),
  /** Local days `YYYY-MM-DD`, inclusive; both optional. */
  from: z.string().regex(localDaySchemaPattern).optional(),
  to: z.string().regex(localDaySchemaPattern).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MovementsQuery = z.input<typeof movementsQuerySchema>;

export const movementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  baseUnit: z.string(),
  type: movementTypeSchema,
  qtyChange: z.number().int(),
  /** Sale, purchase, or adjustment id. */
  refId: z.string(),
  /** TRX or BLI number for sales and purchases. */
  refNumber: z.string().nullable(),
  /** Adjustment reason and note. */
  reason: adjustmentReasonSchema.nullable(),
  note: z.string().nullable(),
  userName: z.string(),
  /** The product's stock right after this movement. */
  balanceAfter: z.number().int(),
  createdAt: z.string(),
});
export type Movement = z.infer<typeof movementSchema>;

export const movementsResponseSchema = z.object({
  /** Newest first. */
  movements: z.array(movementSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type MovementsResponse = z.infer<typeof movementsResponseSchema>;
