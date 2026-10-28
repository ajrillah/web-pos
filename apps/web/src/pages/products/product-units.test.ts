import type { Product, ProductUnit } from '@toko-podomoro/shared';
import { describe, expect, it } from 'vitest';
import {
  baseUnitOf,
  checkLevels,
  type LevelDraft,
  levelCosts,
  levelFactors,
  pyramidFromProduct,
  toUnitInputs,
} from './product-units';

const unit = (over: Partial<ProductUnit> & Pick<ProductUnit, 'id' | 'name' | 'factor'>) => ({
  parentUnitId: null,
  level: 1,
  isi: over.factor,
  costPrice: 0,
  sellPrice: 1000,
  isBase: false,
  active: true,
  ...over,
});

const product = (over: Partial<Product> & Pick<Product, 'units'>): Product => ({
  id: 'p',
  code: 'P',
  name: 'Barang',
  categoryId: 'c',
  categoryName: 'Rokok',
  type: 'unit',
  baseUnit: 'pcs',
  pricingFactor: 1,
  costPrice: 1000,
  stock: 0,
  hasStockMovements: false,
    priceAlert: false,
  active: true,
  unitMode: 'flat',
  unitChain: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

const level = (name: string, isi: number | null, sellPrice: number | null): LevelDraft => ({
  key: name,
  name,
  isi,
  sellPrice,
});

describe('pyramidFromProduct', () => {
  it('reads a pyramid product level by level', () => {
    const levels = pyramidFromProduct(
      product({
        unitMode: 'pyramid',
        units: [
          unit({ id: 'a', name: 'Ball', factor: 200, isi: 1, level: 1 }),
          unit({ id: 'b', name: 'Slop', factor: 10, isi: 20, level: 2, parentUnitId: 'a' }),
          unit({ id: 'c', name: 'Bungkus', factor: 1, isi: 10, level: 3, parentUnitId: 'b' }),
        ],
      }),
    );
    expect(levels).toEqual([
      { key: 'a', id: 'a', name: 'Ball', isi: null, sellPrice: 1000 },
      { key: 'b', id: 'b', name: 'Slop', isi: 20, sellPrice: 1000 },
      { key: 'c', id: 'c', name: 'Bungkus', isi: 10, sellPrice: 1000 },
    ]);
  });

  it('turns flat rows whose factors divide into levels', () => {
    const levels = pyramidFromProduct(
      product({
        units: [
          unit({ id: 'pcs', name: 'pcs', factor: 1, isBase: true, level: 2 }),
          unit({ id: 'dus', name: 'dus', factor: 40 }),
        ],
      }),
    );
    expect(levels).toEqual([
      { key: 'dus', id: 'dus', name: 'dus', isi: null, sellPrice: 1000 },
      { key: 'pcs', id: 'pcs', name: 'pcs', isi: 40, sellPrice: 1000 },
    ]);
  });

  it('keeps flat rows flat when they are not a chain', () => {
    const notDividing = product({
      units: [
        unit({ id: 'a', name: 'pak', factor: 20 }),
        unit({ id: 'b', name: 'lusin', factor: 12 }),
        unit({ id: 'c', name: 'pcs', factor: 1, isBase: true }),
      ],
    });
    expect(pyramidFromProduct(notDividing)).toBeNull();

    const noBaseRow = product({
      units: [unit({ id: 'a', name: 'dus', factor: 40, isBase: true })],
    });
    expect(pyramidFromProduct(noBaseRow)).toBeNull();

    const twiceTheSame = product({
      units: [
        unit({ id: 'a', name: 'bks', factor: 10 }),
        unit({ id: 'b', name: 'pak', factor: 10 }),
        unit({ id: 'c', name: 'pcs', factor: 1, isBase: true }),
      ],
    });
    expect(pyramidFromProduct(twiceTheSame)).toBeNull();
  });

  it('keeps a bulk product out of the pyramid editor', () => {
    const gula = product({
      type: 'bulk',
      baseUnit: 'gram',
      pricingFactor: 1000,
      units: [unit({ id: 'kg', name: 'kg', factor: 1000, isBase: true })],
    });
    expect(pyramidFromProduct(gula)).toBeNull();
  });
});

describe('levelCosts', () => {
  const levels = [
    level('Ball', null, 420_000),
    level('Slop', 20, 21_500),
    level('Bungkus', 10, 2300),
  ];

  it('divides the level 1 cost down the chain', () => {
    expect(levelCosts(400_000, levels)).toEqual([
      { cost: 400_000, rounded: false },
      { cost: 20_000, rounded: false },
      { cost: 2000, rounded: false },
    ]);
  });

  it('marks a level whose cost was rounded up', () => {
    expect(
      levelCosts(10_000, [level('Dus', null, 1), level('Pak', 7, 1), level('Sachet', 3, 1)]),
    ).toEqual([
      { cost: 10_000, rounded: false },
      { cost: 1429, rounded: true },
      { cost: 477, rounded: true },
    ]);
  });

  it('treats a missing cost as zero', () => {
    expect(levelCosts(null, levels).map((c) => c.cost)).toEqual([0, 0, 0]);
  });
});

describe('levelFactors and baseUnitOf', () => {
  const levels = [level('Ball', null, 1), level('Slop', 20, 1), level('Bungkus', 10, 1)];

  it('counts base units per level', () => {
    expect(levelFactors(levels)).toEqual([200, 10, 1]);
  });

  it('takes the stock unit from the deepest level', () => {
    expect(baseUnitOf(levels)).toBe('Bungkus');
    expect(baseUnitOf([])).toBe('');
  });
});

describe('checkLevels', () => {
  const ok = [level('Ball', null, 420_000), level('Slop', 20, 21_500), level('Bungkus', 10, 2300)];

  it('passes complete levels', () => {
    expect(checkLevels(400_000, ok)).toBeNull();
  });

  it('wants a cost price', () => {
    expect(checkLevels(null, ok)).toBe('Harga pokok per Ball wajib diisi.');
  });

  it('wants a name on every level', () => {
    expect(checkLevels(400_000, [level('Ball', null, 420_000), level('  ', 20, 1)])).toBe(
      'Nama satuan tingkat 2 wajib diisi.',
    );
  });

  it('refuses the same name twice', () => {
    expect(checkLevels(400_000, [level('Ball', null, 420_000), level('ball', 20, 21_500)])).toBe(
      'Nama satuan "ball" dipakai dua kali.',
    );
  });

  it('wants an isi of at least 2 below level 1', () => {
    expect(checkLevels(400_000, [level('Ball', null, 420_000), level('Slop', null, 21_500)])).toBe(
      'Isi satuan "Slop" minimal 2 (jumlah Slop dalam satu Ball).',
    );
    expect(checkLevels(400_000, [level('Ball', null, 420_000), level('Slop', 1, 21_500)])).toBe(
      'Isi satuan "Slop" minimal 2 (jumlah Slop dalam satu Ball).',
    );
  });

  it('wants a sell price that covers the level cost', () => {
    expect(checkLevels(400_000, [level('Ball', null, null)])).toBe(
      'Harga jual satuan "Ball" wajib diisi.',
    );
    expect(checkLevels(400_000, [level('Ball', null, 420_000), level('Slop', 20, 19_000)])).toBe(
      'Harga jual satuan "Slop" tidak boleh di bawah harga pokoknya.',
    );
  });

  it('refuses a top unit over the factor limit', () => {
    const huge = [level('l1', null, 1), level('l2', 1000, 1), level('l3', 1001, 1)];
    expect(checkLevels(0, huge)).toContain('terlalu besar');
  });

  it('refuses more than five levels', () => {
    const six = [level('l1', null, 1), ...[2, 3, 4, 5, 6].map((n) => level(`l${n}`, 2, 1))];
    expect(checkLevels(0, six)).toBe('Isi 1 sampai 5 tingkat satuan.');
  });
});

describe('toUnitInputs', () => {
  it('sends the chain top-down with the cost on level 1', () => {
    const levels = [
      { key: 'a', id: 'a', name: ' Ball ', isi: null, sellPrice: 420_000 },
      level('Slop', 20, 21_500),
    ];
    expect(toUnitInputs(400_000, levels)).toEqual([
      { id: 'a', name: 'Ball', isi: 1, sellPrice: 420_000, costPrice: 400_000, isBase: false },
      { name: 'Slop', isi: 20, sellPrice: 21_500, isBase: true },
    ]);
  });
});
