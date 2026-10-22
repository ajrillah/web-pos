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

// --- Purchase cost math (docs/design.md 6.6) ---

/** Buy price for `unitFactor` base units as a cost per `pricingFactor` base units, half up. */
export function costFromBuyPrice(
  buyPrice: number,
  unitFactor: number,
  pricingFactor: number,
): number {
  return mulDivRoundHalfUp(buyPrice, pricingFactor, unitFactor);
}

export interface WeightedAverageInput {
  /** Current stock in base units; negative stock counts as 0. */
  stock: number;
  /** Current cost per `pricingFactor` base units. */
  costPrice: number;
  pricingFactor: number;
  /** Purchased quantity in base units and what it cost in total. */
  qtyBase: number;
  subtotal: number;
}

/**
 * Moving-average cost after a purchase, per `pricingFactor` base units:
 * round((stock * cost + subtotal * pricing_factor) / (stock + qty)), half up.
 */
export function weightedAverageCost({
  stock,
  costPrice,
  pricingFactor,
  qtyBase,
  subtotal,
}: WeightedAverageInput): number {
  assertSafeInteger('stock', stock);
  const onHand = Math.max(0, stock);
  const qty = onHand + qtyBase;
  if (qty <= 0) return costPrice;
  const value =
    mulDivRoundHalfUp(onHand, costPrice, 1) + mulDivRoundHalfUp(subtotal, pricingFactor, 1);
  assertSafeInteger('value', value);
  return mulDivRoundHalfUp(value, 1, qty);
}

/**
 * Margin of a sell unit over its cost in basis points (1850 = 18.50%), half away from zero.
 * Null when the sell price is 0.
 */
export function marginBasisPoints(
  sellPrice: number,
  unitFactor: number,
  costPrice: number,
  pricingFactor: number,
): number | null {
  if (sellPrice <= 0) return null;
  const unitCost = mulDivRoundHalfUp(unitFactor, costPrice, pricingFactor);
  const profit = sellPrice - unitCost;
  const bp = mulDivRoundHalfUp(Math.abs(profit), 10_000, sellPrice);
  return profit < 0 ? -bp : bp;
}
