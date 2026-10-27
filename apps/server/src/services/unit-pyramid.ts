import {
  BULK_FACTOR,
  bulkBaseUnitSchema,
  bulkSellUnit,
  chainCosts,
  chainFactors,
  MAX_PYRAMID_LEVELS,
  MAX_UNIT_FACTOR,
  type ProductType,
  type ProductUnitInput,
  type UnitMode,
  unitFactors,
} from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import type { UnitRow } from '../repositories/products-repository';

// Turns the unit rows of a product request into the rows to store. Rules: docs/design.md 4.1.1.

/** One unit row to store, with everything the pyramid rules decide. */
export interface PlannedUnit {
  /** An existing row of this product, or undefined for a new row. */
  id?: string | undefined;
  name: string;
  isi: number;
  level: number;
  /** Index in `UnitPlan.units` of the level above; null for level 1 and flat rows. */
  parentIndex: number | null;
  costPrice: number;
  sellPrice: number;
  /** Base units in one of this unit; not stored. */
  factor: number;
}

export interface UnitPlan {
  /** Stock unit: the deepest level of a pyramid, else the requested one. */
  baseUnit: string;
  /** `products.cost_price`: cost for `pricing_factor` base units. */
  costPrice: number;
  /** Level 1 first; a pyramid chain or independent flat rows. */
  units: PlannedUnit[];
}

export interface UnitPlanInput {
  type: ProductType;
  baseUnit: string;
  unitMode: UnitMode;
  costPrice?: number | undefined;
  units: ProductUnitInput[];
}

/** Base units in one of each stored row, by row id (inactive rows stand on their own). */
export function storedFactors(rows: UnitRow[]): Map<string, number> {
  const active = rows.filter((r) => r.active);
  return unitFactors(active.map((r) => ({ id: r.id, parentUnitId: r.parentUnitId, isi: r.isi })));
}

/** The product cost of a flat request; it is required there (shared `checkCostFields`). */
function flatCost(input: UnitPlanInput): number {
  if (input.costPrice === undefined) {
    throw appErrors.invalidUnits('Harga pokok wajib diisi.');
  }
  return input.costPrice;
}

function checkNamesDiffer(units: ProductUnitInput[]): void {
  const names = units.map((u) => u.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw appErrors.invalidUnits('Nama satuan tidak boleh sama.');
  }
}

/** Bulk: stock unit gram/ml and one sell unit kg/liter of 1000 base units (docs/design.md 4.1). */
function planBulk(input: UnitPlanInput): UnitPlan {
  const bulkBase = bulkBaseUnitSchema.safeParse(input.baseUnit.toLowerCase());
  if (!bulkBase.success) {
    throw appErrors.invalidUnits('Satuan stok barang curah harus gram atau ml.');
  }
  const sellUnit = bulkSellUnit[bulkBase.data];
  const [only] = input.units;
  if (input.units.length !== 1 || !only || only.name.toLowerCase() !== sellUnit) {
    throw appErrors.invalidUnits(
      `Barang curah hanya punya satu satuan jual: ${sellUnit} (isi ${BULK_FACTOR} ${bulkBase.data}).`,
    );
  }
  if (only.isi !== BULK_FACTOR) {
    throw appErrors.invalidUnits(`Isi satuan ${sellUnit} harus ${BULK_FACTOR} ${bulkBase.data}.`);
  }
  const costPrice = flatCost(input);
  return {
    baseUnit: bulkBase.data,
    costPrice,
    // cost_price is per pricing_factor (1000) base units, which is one kg / liter.
    units: [
      {
        id: only.id,
        name: sellUnit,
        isi: BULK_FACTOR,
        level: 1,
        parentIndex: null,
        costPrice,
        sellPrice: only.sellPrice,
        factor: BULK_FACTOR,
      },
    ],
  };
}

/**
 * Flat rows (products created before MS1, kept working): every row counts base units on its own
 * and the primary row sits at the deepest level, so `isBase` survives without a column.
 */
function planFlat(input: UnitPlanInput): UnitPlan {
  if (input.units.filter((u) => u.isBase).length !== 1) {
    throw appErrors.invalidUnits('Pilih tepat satu satuan utama.');
  }
  checkNamesDiffer(input.units);
  const costPrice = flatCost(input);
  // Others by content descending, then the primary unit: see docs/design.md 4.1.1.
  const ordered = [
    ...input.units.filter((u) => !u.isBase).sort((a, b) => b.isi - a.isi),
    ...input.units.filter((u) => u.isBase),
  ];
  return {
    baseUnit: input.baseUnit,
    costPrice,
    units: ordered.map((unit, index) => ({
      id: unit.id,
      name: unit.name,
      isi: unit.isi,
      level: index + 1,
      parentIndex: null,
      // Flat rows divide exactly: pricing_factor is 1, or the single bulk row is handled above.
      costPrice: unit.isi * costPrice,
      sellPrice: unit.sellPrice,
      factor: unit.isi,
    })),
  };
}

/** One chain, level 1 first: `isi` counts units per parent and the cost divides down (4.1.1). */
function planPyramid(input: UnitPlanInput): UnitPlan {
  const [top] = input.units;
  if (!top || input.units.length > MAX_PYRAMID_LEVELS) {
    throw appErrors.invalidUnits(`Satuan bertingkat maksimal ${MAX_PYRAMID_LEVELS} tingkat.`);
  }
  checkNamesDiffer(input.units);
  const deepest = input.units[input.units.length - 1] as ProductUnitInput;
  if (bulkBaseUnitSchema.safeParse(deepest.name.toLowerCase()).success) {
    throw appErrors.invalidUnits('Satuan stok gram atau ml hanya untuk barang curah.');
  }
  // Level 1 has no parent, so its isi is not a conversion; every level below needs a real one.
  const isi = input.units.map((unit, index) => {
    if (index > 0 && unit.isi < 2) {
      throw appErrors.invalidUnits(
        `Isi satuan "${unit.name}" minimal 2 (jumlah ${unit.name} dalam satu ${input.units[index - 1]?.name}).`,
      );
    }
    return index === 0 ? 1 : unit.isi;
  });
  const factors = chainFactors(isi);
  if ((factors[0] as number) > MAX_UNIT_FACTOR) {
    throw appErrors.invalidUnits(
      `Satu ${top.name} terlalu besar: maksimal ${MAX_UNIT_FACTOR} ${deepest.name}.`,
    );
  }
  if (top.costPrice === undefined) {
    throw appErrors.invalidUnits(`Harga pokok per ${top.name} wajib diisi.`);
  }
  const costs = chainCosts(top.costPrice, isi);
  const units = input.units.map((unit, index) => {
    const costPrice = costs[index] as number;
    if (unit.sellPrice < costPrice) {
      throw appErrors.invalidUnits(
        `Harga jual satuan "${unit.name}" tidak boleh di bawah harga pokoknya.`,
      );
    }
    return {
      id: unit.id,
      name: unit.name,
      isi: isi[index] as number,
      level: index + 1,
      parentIndex: index === 0 ? null : index - 1,
      costPrice,
      sellPrice: unit.sellPrice,
      factor: factors[index] as number,
    };
  });
  return {
    // The deepest level is the stock unit, and its cost is the cost of one base unit.
    baseUnit: deepest.name,
    costPrice: costs[costs.length - 1] as number,
    units,
  };
}

/** Checks a request's unit rows and returns the rows to store (docs/design.md 4.1.1). */
export function planUnits(input: UnitPlanInput): UnitPlan {
  if (input.type === 'bulk') {
    return planBulk(input);
  }
  if (bulkBaseUnitSchema.safeParse(input.baseUnit.toLowerCase()).success) {
    throw appErrors.invalidUnits('Satuan stok gram atau ml hanya untuk barang curah.');
  }
  return input.unitMode === 'pyramid' ? planPyramid(input) : planFlat(input);
}

/**
 * Stock is never converted: once a product has movements, a row that counts exactly one base
 * unit must keep counting one, so no level can be added below it (docs/design.md 6.5).
 */
export function checkBaseUnitKept(plan: UnitPlan, stored: UnitRow[]): void {
  const factors = storedFactors(stored);
  const planned = new Map(plan.units.flatMap((u) => (u.id ? [[u.id, u.factor]] : [])));
  for (const row of stored) {
    if (factors.get(row.id) === 1 && planned.has(row.id) && planned.get(row.id) !== 1) {
      throw appErrors.stockUnitLocked();
    }
  }
}
