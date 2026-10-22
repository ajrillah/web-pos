import { z } from 'zod';

// Contracts for categories and products. See docs/design.md sections 4.1, 6.5, and 10.

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
  /** Base units in one of this unit. */
  factor: z.number().int(),
  /** Price for `factor` base units. */
  sellPrice: z.number().int(),
  /** Primary sell unit (not the stock unit). */
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
  active: z.boolean(),
  /** Active unit rows, primary first, then by factor. */
  units: z.array(productUnitSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

/** A unit row in a create/update request. `id` refers to an existing row of the product. */
export const productUnitInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: unitNameSchema,
  factor: z.number().int().min(1).max(MAX_UNIT_FACTOR),
  sellPrice: moneySchema,
  isBase: z.boolean(),
});
export type ProductUnitInput = z.infer<typeof productUnitInputSchema>;

const productFields = {
  code: productCodeSchema,
  name: nameSchema,
  categoryId: z.string().min(1),
  type: productTypeSchema,
  baseUnit: unitNameSchema,
  costPrice: moneySchema,
  /** The full set of active unit rows; existing rows left out are deactivated. */
  units: z.array(productUnitInputSchema).min(1).max(MAX_UNITS_PER_PRODUCT),
};

export const createProductRequestSchema = z.object({
  ...productFields,
  /** Recorded as a stock adjustment (reason `lainnya`, note "Stok awal") with a movement. */
  initialStock: z.number().int().min(0).max(MAX_QTY).default(0),
});
export type CreateProductRequest = z.input<typeof createProductRequestSchema>;
/** Parsed request (defaults applied), as services receive it. */
export type CreateProductInput = z.output<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z.object(productFields);
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

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
