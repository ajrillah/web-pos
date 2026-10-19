import { z } from 'zod';

// All money is integer Rupiah and all quantities are integers in the product's stock unit.
// See docs/design.md section 4.1.

export const roundingModeSchema = z.enum(['none', '100', '500']);
export type RoundingMode = z.infer<typeof roundingModeSchema>;

function assertSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

function assertNonNegative(name: string, value: number): void {
  assertSafeInteger(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must not be negative, got ${value}`);
  }
}

function assertPositive(name: string, value: number): void {
  assertSafeInteger(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be positive, got ${value}`);
  }
}

/**
 * Computes round(a * b / divisor) with half-up rounding, without floating point.
 * Inputs must be non-negative; the product a * b must stay a safe integer.
 */
export function mulDivRoundHalfUp(a: number, b: number, divisor: number): number {
  assertNonNegative('a', a);
  assertNonNegative('b', b);
  assertPositive('divisor', divisor);
  const product = a * b;
  assertSafeInteger('a * b', product);
  const quotient = Math.floor(product / divisor);
  const remainder = product - quotient * divisor;
  return remainder * 2 >= divisor ? quotient + 1 : quotient;
}

export interface LineSubtotalInput {
  qtyBase: number;
  unitPrice: number;
  unitFactor: number;
}

/** subtotal = round(qty_base * unit_price / unit_factor), half up, once per line. */
export function lineSubtotal({ qtyBase, unitPrice, unitFactor }: LineSubtotalInput): number {
  return mulDivRoundHalfUp(qtyBase, unitPrice, unitFactor);
}

export interface LineCostTotalInput {
  qtyBase: number;
  costPrice: number;
  pricingFactor: number;
}

/** cost_total = round(qty_base * cost_price / pricing_factor), half up, once per line. */
export function lineCostTotal({ qtyBase, costPrice, pricingFactor }: LineCostTotalInput): number {
  return mulDivRoundHalfUp(qtyBase, costPrice, pricingFactor);
}

export interface RoundedTotal {
  /** Total after rounding; this is what sales.total stores. */
  total: number;
  /** total - sum(subtotals); may be negative. */
  roundingAmount: number;
}

const roundingSteps: Record<RoundingMode, number> = { none: 1, '100': 100, '500': 500 };

/** Rounds the sum of line subtotals to the nearest step; ties round up. */
export function roundSaleTotal(subtotalSum: number, mode: RoundingMode): RoundedTotal {
  assertNonNegative('subtotalSum', subtotalSum);
  const step = roundingSteps[mode];
  const total = mulDivRoundHalfUp(subtotalSum, 1, step) * step;
  assertSafeInteger('total', total);
  return { total, roundingAmount: total - subtotalSum };
}
