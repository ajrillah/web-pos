import { z } from 'zod';
import { formatInteger } from './rupiah';

// Unit pyramid math and display. Rules: docs/design.md 4.1.1.

/** Levels in one pyramid: level 1 (largest) down to the stock unit. */
export const MAX_PYRAMID_LEVELS = 5;

export const unitModeSchema = z.enum(['flat', 'pyramid']);
/** `pyramid`: one chain of levels. `flat`: independent rows (pre-MS1 products, bulk). */
export type UnitMode = z.infer<typeof unitModeSchema>;

/** One level of a product's pyramid, for displaying a stock level. */
export const unitChainItemSchema = z.object({
  name: z.string(),
  /** Base units in one of this unit; 1 for the deepest level. */
  factor: z.number().int(),
});
export type UnitChainItem = z.infer<typeof unitChainItemSchema>;

/** Levels top-down, empty for a flat product. */
export const unitChainSchema = z.array(unitChainItemSchema);

/** A unit row as the pyramid math sees it. */
export interface PyramidRow {
  id: string;
  parentUnitId: string | null;
  isi: number;
}

/**
 * Base units in one of each unit row, by row id (docs/design.md 4.1.1): the product of the `isi`
 * values below the row, so the deepest level is 1; a flat row (no parent, no children) is its
 * own `isi`.
 */
export function unitFactors(rows: PyramidRow[]): Map<string, number> {
  const childOf = new Map<string, PyramidRow>();
  for (const row of rows) {
    if (row.parentUnitId !== null) childOf.set(row.parentUnitId, row);
  }
  const factors = new Map<string, number>();
  for (const row of rows) {
    let factor = 1;
    // Walk down the chain; the step limit also stops a cycle in corrupted data.
    let child = childOf.get(row.id);
    for (let step = 0; child && step < MAX_PYRAMID_LEVELS; step++) {
      factor *= child.isi;
      child = childOf.get(child.id);
    }
    factors.set(row.id, row.parentUnitId === null && !childOf.has(row.id) ? row.isi : factor);
  }
  return factors;
}

/** Base units in one of each level of a chain, top-down. `isi[0]` (the top) is ignored. */
export function chainFactors(isi: number[]): number[] {
  const factors = isi.map(() => 1);
  for (let i = isi.length - 2; i >= 0; i--) {
    factors[i] = (factors[i + 1] as number) * (isi[i + 1] as number);
  }
  return factors;
}

/**
 * Cost of one of each level, top-down: the level below costs `ceil(parent / isi)`, so a level is
 * never priced below what it costs (docs/design.md 4.1.1). `isi[0]` (the top) is ignored.
 */
export function chainCosts(topCost: number, isi: number[]): number[] {
  const costs = [topCost];
  for (let i = 1; i < isi.length; i++) {
    costs.push(Math.ceil((costs[i - 1] as number) / (isi[i] as number)));
  }
  return costs;
}

/**
 * Stock as a multi-unit breakdown, filled top-down by integer division:
 * `1 Ball 19 Slop 6 Bungkus`. Levels with a zero count are left out and zero reads
 * `0 <deepest unit>`. A flat product (empty `chain`) reads `12 pcs` (docs/design.md 4.1.1).
 */
export function formatStockPyramid(qty: number, chain: UnitChainItem[], baseUnit: string): string {
  if (!Number.isSafeInteger(qty)) {
    throw new RangeError(`qty must be a safe integer, got ${qty}`);
  }
  const deepest = chain[chain.length - 1];
  if (!deepest) return `${formatInteger(qty)} ${baseUnit}`;
  const sign = qty < 0 ? '-' : '';
  let rest = Math.abs(qty);
  const parts: string[] = [];
  for (const level of chain) {
    const count = Math.floor(rest / level.factor);
    rest -= count * level.factor;
    if (count > 0) parts.push(`${formatInteger(count)} ${level.name}`);
  }
  if (parts.length === 0) return `0 ${deepest.name}`;
  return `${sign}${parts.join(' ')}`;
}
