import type { Product } from '@toko-podomoro/shared';
import { describe, expect, it } from 'vitest';
import {
  costChanged,
  costOptions,
  lineProblem,
  marginOf,
  newLine,
  purchaseTotal,
  qtyBaseOf,
  subtotalOf,
  toLineInputs,
} from './purchase-lines';

const base = {
  categoryId: 'c',
  categoryName: 'Sembako',
  hasStockMovements: true,
  active: true,
  createdAt: '',
  updatedAt: '',
};

const indomie: Product = {
  ...base,
  id: 'idm',
  code: 'IDM',
  name: 'Indomie',
  type: 'unit',
  baseUnit: 'pcs',
  pricingFactor: 1,
  costPrice: 2500,
  stock: 10,
  units: [
    { id: 'pcs', name: 'pcs', factor: 1, sellPrice: 3500, isBase: true, active: true },
    { id: 'dus', name: 'dus', factor: 40, sellPrice: 130000, isBase: false, active: true },
  ],
};

const gula: Product = {
  ...base,
  id: 'gl',
  code: 'GL',
  name: 'Gula',
  type: 'bulk',
  baseUnit: 'gram',
  pricingFactor: 1000,
  costPrice: 14000,
  stock: 2000,
  units: [{ id: 'kg', name: 'kg', factor: 1000, sellPrice: 17000, isBase: true, active: true }],
};

describe('purchase lines', () => {
  it('starts on the primary unit at the current cost', () => {
    const line = newLine(indomie);
    expect(line).toMatchObject({ unitId: 'pcs', qty: null, newCostPrice: 2500 });
    expect(costChanged(line)).toBe(false);
  });

  it('converts unit counts and bulk grams to base units', () => {
    const dus = { ...newLine(indomie), unitId: 'dus', qty: 2, buyPrice: 104000 };
    expect(qtyBaseOf(dus)).toBe(80);
    expect(subtotalOf(dus)).toBe(208000);
    const bulk = { ...newLine(gula), qty: 1500, buyPrice: 13333 };
    expect(qtyBaseOf(bulk)).toBe(1500);
    // 1500 * 13333 / 1000 = 19999.5 -> 20000
    expect(subtotalOf(bulk)).toBe(20000);
    expect(purchaseTotal([dus, bulk])).toBe(228000);
    expect(toLineInputs([dus])).toEqual([
      { productId: 'idm', unitId: 'dus', qtyBase: 80, buyPrice: 104000, newCostPrice: 2500 },
    ]);
  });

  it('suggests this buy, the last buy, and the weighted average as costs', () => {
    const line = {
      ...newLine(indomie),
      unitId: 'dus',
      qty: 1,
      buyPrice: 112000,
      suggestion: {
        productId: 'idm',
        costPrice: 2500,
        pricingFactor: 1,
        stock: 40,
        lastBuyCost: 2400,
        lastBuyDate: '2026-10-01',
      },
    };
    // 40 on hand at 2.500 + 40 at 2.800 -> 2.650
    expect(costOptions(line)).toEqual({ thisBuy: 2800, lastBuy: 2400, average: 2650 });
    expect(costOptions(newLine(indomie))).toEqual({ thisBuy: null, lastBuy: null, average: null });
  });

  it('shows the primary unit margin at the new cost', () => {
    expect(marginOf({ ...newLine(indomie), newCostPrice: 2800 })).toBe(2000);
    expect(marginOf({ ...newLine(gula), newCostPrice: 18000 })).toBe(-588);
  });

  it('explains what is missing before saving', () => {
    expect(lineProblem([])).toBe('Tambahkan barang yang masuk.');
    expect(lineProblem([newLine(indomie)])).toBe('Isi jumlah Indomie.');
    expect(lineProblem([{ ...newLine(indomie), qty: 1 }])).toBe('Isi harga beli Indomie.');
    expect(lineProblem([{ ...newLine(indomie), qty: 1, buyPrice: 0 }])).toBeNull();
  });
});
