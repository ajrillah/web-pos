import { z } from 'zod';
import { MAX_PYRAMID_LEVELS, type UnitMode, unitChainSchema, unitModeSchema } from './units';

// Contracts for categories and products. See docs/design.md sections 4.1, 4.1.1, 6.5, and 10.

export const MAX_MONEY = 1_000_000_000;
export const MAX_QTY = 1_000_000_000;
export const MAX_UNIT_FACTOR = 1_000_000;
export const MAX_UNITS_PER_PRODUCT = 10;

/** Bulk prices are per kg / liter: 1000 base units (gram / ml). */
export const BULK_FACTOR = 1000;

export const productTypeSchema = z.enum(['unit', 'bulk']);
export type ProductType = z.infer<typeof productTypeSchema>;

export const bulkBaseUnitSchema = z.enum(['gram', 'ml']);
export type BulkBaseUnit = z.infer<typeof bulkBaseUnitSchema>;

/** The single sell unit of a bulk product, by its stock unit. */
export const bulkSellUnit: Record<BulkBaseUnit, string> = { gram: 'kg', ml: 'liter' };

/** `pricing_factor`: base units that `cost_price` refers to. */
export function pricingFactorFor(type: ProductType): number {
  return type === 'bulk' ? BULK_FACTOR : 1;
}

export const moneySchema = z.number().int().min(0).max(MAX_MONEY);

/** Letters, digits, and `. _ / -`; no spaces (codes are typed and scanned). Unique ignoring case. */
export const productCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._/-]+$/);

const nameSchema = z.string().trim().min(1).max(100);
const unitNameSchema = z.string().trim().min(1).max(20);

// --- Categories ---

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;

export const categoryResponseSchema = z.object({ category: categorySchema });
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export const createCategoryRequestSchema = z.object({ name: nameSchema });
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z
  .object({ name: nameSchema.optional(), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0);
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

// --- Products ---

export const productUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Unit one level up in the pyramid; null for a level 1 or flat row. */
  parentUnitId: z.string().nullable(),
  /** 1 = largest; the deepest level is the stock unit (docs/design.md 4.1.1). */
  level: z.number().int(),
  /** Units of this kind in one of the parent; a flat row: base units in one of this unit. */
  isi: z.number().int(),
  /** Base units in one of this unit; computed from `isi`. */
  factor: z.number().int(),
  /** Cost for one of this unit. */
  costPrice: z.number().int(),
  /** Price for one of this unit (`factor` base units). */
  sellPrice: z.number().int(),
  /** Primary sell unit: the deepest level (not the stock unit of a flat product). */
  isBase: z.boolean(),
  active: z.boolean(),
});
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const productSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  type: productTypeSchema,
  /** Stock unit: pcs, gram, ml, ... */
  baseUnit: z.string(),
  pricingFactor: z.number().int(),
  /** Cost for `pricingFactor` base units. */
  costPrice: z.number().int(),
  /** Cached stock in base units; may be negative. */
  stock: z.number().int(),
  /** Has stock movements: type, stock unit kind, and smallest unit are fixed (design 6.5). */
  hasStockMovements: z.boolean(),
  /** MS3: flagged when a purchase records a cost_price above the current cost. */
  priceAlert: z.boolean(),
  active: z.boolean(),
  /** Shape of `units`: one pyramid chain, or independent flat rows. */
  unitMode: unitModeSchema,
  /** Active unit rows, by level (largest first). */
  units: z.array(productUnitSchema),
  /** Levels top-down for the stock breakdown; empty for a flat product. */
  unitChain: unitChainSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

/**
 * A unit row in a create/update request. `id` refers to an existing row of the product.
 * `pyramid` requests send the levels top-down: `isi` is left out on the first row and tells how
 * many fit in one of the row above on the others, `costPrice` is given on the first row only, and
 * `isBase` is ignored (the deepest level is primary). `flat` requests send independent rows with
 * `isi` = base units in one of the unit and exactly one `isBase` (docs/design.md 4.1.1).
 */
export const productUnitInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: unitNameSchema,
  isi: z.number().int().min(1).max(MAX_UNIT_FACTOR).default(1),
  costPrice: moneySchema.optional(),
  sellPrice: moneySchema,
  isBase: z.boolean().default(false),
});
export type ProductUnitInput = z.output<typeof productUnitInputSchema>;

const productFields = {
  code: productCodeSchema,
  name: nameSchema,
  categoryId: z.string().min(1),
  type: productTypeSchema,
  baseUnit: unitNameSchema,
  /** Flat products: cost for `pricingFactor` base units. Pyramid: left out, it comes per level. */
  costPrice: moneySchema.optional(),
  unitMode: unitModeSchema.default('flat'),
  /** The full set of active unit rows; existing rows left out are deactivated. */
  units: z.array(productUnitInputSchema).min(1).max(MAX_UNITS_PER_PRODUCT),
};

/** Where the cost price belongs: on the product (flat) or on the first level (pyramid). */
function checkCostFields(
  value: { unitMode: UnitMode; costPrice?: number | undefined; units: ProductUnitInput[] },
  ctx: z.RefinementCtx,
): void {
  if (value.unitMode === 'pyramid') {
    if (value.units.length > MAX_PYRAMID_LEVELS) {
      ctx.addIssue({
        code: 'custom',
        path: ['units'],
        message: `max ${MAX_PYRAMID_LEVELS} levels`,
      });
    }
    if (value.units[0]?.costPrice === undefined) {
      ctx.addIssue({ code: 'custom', path: ['units', 0, 'costPrice'], message: 'required' });
    }
  } else if (value.costPrice === undefined) {
    ctx.addIssue({ code: 'custom', path: ['costPrice'], message: 'required' });
  }
}

export const createProductRequestSchema = z
  .object({
    ...productFields,
    /** Recorded as a stock adjustment (reason `lainnya`, note "Stok awal") with a movement. */
    initialStock: z.number().int().min(0).max(MAX_QTY).default(0),
  })
  .superRefine(checkCostFields);
export type CreateProductRequest = z.input<typeof createProductRequestSchema>;
/** Parsed request (defaults applied), as services receive it. */
export type CreateProductInput = z.output<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z.object(productFields).superRefine(checkCostFields);
export type UpdateProductRequest = z.input<typeof updateProductRequestSchema>;
/** Parsed request (defaults applied), as services receive it. */
export type UpdateProductInput = z.output<typeof updateProductRequestSchema>;

export const setProductActiveRequestSchema = z.object({ active: z.boolean() });
export type SetProductActiveRequest = z.infer<typeof setProductActiveRequestSchema>;

export const productStatusFilterSchema = z.enum(['active', 'inactive', 'all']);
export type ProductStatusFilter = z.infer<typeof productStatusFilterSchema>;

export const productsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().min(1).optional(),
  status: productStatusFilterSchema.default('active'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProductsQuery = z.input<typeof productsQuerySchema>;

export const productsResponseSchema = z.object({
  products: z.array(productSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type ProductsResponse = z.infer<typeof productsResponseSchema>;

export const productResponseSchema = z.object({ product: productSchema });
export type ProductResponse = z.infer<typeof productResponseSchema>;

// --- Stock adjustments ---

export const adjustmentReasonSchema = z.enum([
  'rusak',
  'kedaluwarsa',
  'hilang',
  'opname',
  'lainnya',
]);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
