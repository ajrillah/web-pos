import {
  chainCosts,
  chainFactors,
  MAX_PYRAMID_LEVELS,
  MAX_UNIT_FACTOR,
  type Product,
  type ProductUnitInput,
} from '@toko-podomoro/shared';

// Draft state for the unit pyramid in the product form. Rules: docs/design.md 4.1.1 and 6.5.

/** One level in the form, top-down. `isi` is empty on level 1 (it has no parent). */
export interface LevelDraft {
  key: string;
  /** Existing unit row of the product; absent for a level the user just added. */
  id?: string;
  name: string;
  /** How many of this unit fit in one of the level above. */
  isi: number | null;
  sellPrice: number | null;
}

const newKey = () => crypto.randomUUID();

export const emptyLevel = (): LevelDraft => ({
  key: newKey(),
  name: '',
  isi: null,
  sellPrice: null,
});

/** The stock unit of a pyramid: the name of its deepest level. */
export const baseUnitOf = (levels: LevelDraft[]): string =>
  levels[levels.length - 1]?.name.trim() ?? '';

/**
 * The product's levels for the form, or null when its flat rows are not a pyramid: the form then
 * keeps the flat editor so a pre-MS1 product is never restructured by accident.
 */
export function pyramidFromProduct(product: Product): LevelDraft[] | null {
  const asLevel = (u: Product['units'][number], isi: number | null): LevelDraft => ({
    key: u.id,
    id: u.id,
    name: u.name,
    isi,
    sellPrice: u.sellPrice,
  });
  if (product.unitMode === 'pyramid') {
    return product.units.map((u, index) => asLevel(u, index === 0 ? null : u.isi));
  }
  if (product.type === 'bulk') return null;
  // A flat product is a pyramid in disguise when its factors divide down to one base unit.
  const units = [...product.units].sort((a, b) => b.factor - a.factor);
  const deepest = units[units.length - 1];
  if (deepest?.factor !== 1) return null;
  const levels: LevelDraft[] = [];
  for (const [index, unit] of units.entries()) {
    if (index === 0) {
      levels.push(asLevel(unit, null));
      continue;
    }
    const above = units[index - 1] as Product['units'][number];
    const isi = above.factor / unit.factor;
    if (!Number.isInteger(isi) || isi < 2) return null;
    levels.push(asLevel(unit, isi));
  }
  return levels.length > MAX_PYRAMID_LEVELS ? null : levels;
}

/** `isi` per level with level 1 normalized to 1, as the pyramid math expects. */
const isiOf = (levels: LevelDraft[]): number[] =>
  levels.map((level, index) => (index === 0 ? 1 : (level.isi ?? 1)));

export interface LevelCost {
  /** Cost of one of this unit. */
  cost: number;
  /** `ceil` moved the cost up, so the form warns that it was rounded. */
  rounded: boolean;
}

/** Cost of one of each level from the level 1 cost, rounded up down the chain (4.1.1). */
export function levelCosts(topCost: number | null, levels: LevelDraft[]): LevelCost[] {
  const isi = isiOf(levels);
  const costs = chainCosts(topCost ?? 0, isi);
  return costs.map((cost, index) => ({
    cost,
    rounded: index > 0 && (costs[index - 1] as number) % (isi[index] as number) !== 0,
  }));
}

/** Base units in one of each level, top-down. */
export const levelFactors = (levels: LevelDraft[]): number[] => chainFactors(isiOf(levels));

/** First problem with the levels as an Indonesian message, or null when they are complete. */
export function checkLevels(topCost: number | null, levels: LevelDraft[]): string | null {
  if (levels.length === 0 || levels.length > MAX_PYRAMID_LEVELS) {
    return `Isi 1 sampai ${MAX_PYRAMID_LEVELS} tingkat satuan.`;
  }
  if (topCost === null) return `Harga pokok per ${levels[0]?.name.trim() || 'satuan'} wajib diisi.`;
  const names = new Set<string>();
  const costs = levelCosts(topCost, levels);
  for (const [index, level] of levels.entries()) {
    const name = level.name.trim();
    if (!name) return `Nama satuan tingkat ${index + 1} wajib diisi.`;
    if (names.has(name.toLowerCase())) return `Nama satuan "${name}" dipakai dua kali.`;
    names.add(name.toLowerCase());
    if (index > 0 && (level.isi === null || level.isi < 2)) {
      return `Isi satuan "${name}" minimal 2 (jumlah ${name} dalam satu ${levels[index - 1]?.name.trim() || 'satuan di atasnya'}).`;
    }
    if (level.sellPrice === null) return `Harga jual satuan "${name}" wajib diisi.`;
    if (level.sellPrice < (costs[index] as LevelCost).cost) {
      return `Harga jual satuan "${name}" tidak boleh di bawah harga pokoknya.`;
    }
  }
  const [top] = levelFactors(levels);
  if ((top as number) > MAX_UNIT_FACTOR) {
    return `Satu ${levels[0]?.name.trim()} terlalu besar: maksimal ${MAX_UNIT_FACTOR.toLocaleString('id-ID')} ${baseUnitOf(levels)}.`;
  }
  return null;
}

/** The `units` of a `pyramid` request: level 1 first, cost on level 1 only (4.1.1). */
export function toUnitInputs(topCost: number, levels: LevelDraft[]): ProductUnitInput[] {
  return levels.map((level, index) => ({
    ...(level.id ? { id: level.id } : {}),
    name: level.name.trim(),
    isi: index === 0 ? 1 : (level.isi ?? 1),
    sellPrice: level.sellPrice ?? 0,
    ...(index === 0 ? { costPrice: topCost } : {}),
    isBase: index === levels.length - 1,
  }));
}
