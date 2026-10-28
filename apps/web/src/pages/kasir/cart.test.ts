import type { Product } from '@toko-podomoro/shared';
import { describe, expect, it } from 'vitest';
import { type Cart, cartQtyOf, cartReducer, cartTotals, emptyCart, saleLines } from './cart';

const product = (over: Partial<Product> & Pick<Product, 'id' | 'type' | 'units'>): Product => ({
  code: over.id.toUpperCase(),
  name: over.id,
  categoryId: 'c',
  categoryName: 'Sembako',
  baseUnit: over.type === 'bulk' ? 'gram' : 'pcs',
  pricingFactor: over.type === 'bulk' ? 1000 : 1,
  costPrice: 0,
  stock: 10,
  hasStockMovements: true,
    priceAlert: false,
  active: true,
  unitMode: 'flat',
  unitChain: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

const unit = (id: string, name: string, factor: number, sellPrice: number, isBase = false) => ({
  id,
  name,
  parentUnitId: null,
  level: 1,
  isi: factor,
  factor,
  costPrice: 0,
  sellPrice,
  isBase,
  active: true,
});

const rokok = product({
  id: 'rokok',
  type: 'unit',
  units: [unit('bks', 'bungkus', 16, 33000, true), unit('btg', 'batang', 1, 2200)],
});
const gula = product({ id: 'gula', type: 'bulk', units: [unit('kg', 'kg', 1000, 17500, true)] });

const run = (...actions: Parameters<typeof cartReducer>[1][]): Cart =>
  actions.reduce(cartReducer, emptyCart);

describe('cartReducer', () => {
  it('adds a product in its primary unit and marks it newest', () => {
    const cart = run({ type: 'add', product: rokok });
    expect(cart.lines).toMatchObject([{ unitId: 'bks', qtyBase: 16 }]);
    expect(cart.newestKey).toBe(cart.lines[0]?.key);
  });

  it('adds the same product and unit onto the existing line', () => {
    const cart = run({ type: 'add', product: rokok }, { type: 'add', product: rokok });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.qtyBase).toBe(32);
  });

  it('keeps a different unit of the same product on its own line', () => {
    const cart = run(
      { type: 'add', product: rokok },
      { type: 'add', product: rokok, unitId: 'btg' },
    );
    expect(cart.lines.map((l) => [l.unitId, l.qtyBase])).toEqual([
      ['bks', 16],
      ['btg', 1],
    ]);
    expect(cartQtyOf(cart, 'rokok')).toBe(17);
  });

  it('adds bulk items with the weight in grams', () => {
    const cart = run({ type: 'add', product: gula, qtyBase: 1500 });
    expect(cartTotals(cart, 'none')).toEqual({ subtotal: 26250, roundingAmount: 0, total: 26250 });
  });

  it('changes the unit keeping the count of sell units', () => {
    const start = run({ type: 'add', product: rokok }, { type: 'add', product: rokok });
    const key = start.lines[0]?.key ?? '';
    const cart = cartReducer(start, { type: 'setUnit', key, unitId: 'btg' });
    expect(cart.lines[0]).toMatchObject({ unitId: 'btg', qtyBase: 2 });
  });

  it('ignores quantities below 1 and removes lines', () => {
    const start = run({ type: 'add', product: rokok });
    const key = start.lines[0]?.key ?? '';
    expect(cartReducer(start, { type: 'setQty', key, qtyBase: 0 })).toBe(start);
    expect(cartReducer(start, { type: 'remove', key })).toEqual(emptyCart);
  });

  it('drops lines whose product was deactivated when refreshing products', () => {
    const start = run(
      { type: 'add', product: rokok },
      { type: 'add', product: gula, qtyBase: 500 },
    );
    const cart = cartReducer(start, {
      type: 'replaceProducts',
      products: new Map([
        ['rokok', { ...rokok, active: false }],
        ['gula', gula],
      ]),
    });
    expect(cart.lines.map((l) => l.product.id)).toEqual(['gula']);
  });
});

describe('cartTotals and saleLines', () => {
  it('rounds the sum of line subtotals per setting', () => {
    const cart = run(
      { type: 'add', product: gula, qtyBase: 1500 },
      { type: 'add', product: rokok, unitId: 'btg', qtyBase: 3 },
    );
    expect(cartTotals(cart, '500')).toEqual({ subtotal: 32850, roundingAmount: 150, total: 33000 });
    expect(saleLines(cart)).toEqual([
      { productId: 'gula', unitId: 'kg', qtyBase: 1500 },
      { productId: 'rokok', unitId: 'btg', qtyBase: 3 },
    ]);
  });
});
