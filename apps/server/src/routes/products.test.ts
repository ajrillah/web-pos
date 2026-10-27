import type { Product } from '@toko-podomoro/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sumMovements } from '../repositories/stock-repository';
import {
  activeCashier,
  asProductInput,
  auditRows,
  createHarness,
  type Harness,
  setupOwner,
  withSession,
} from '../testing/harness';

let h: Harness;
let ownerToken: string;
let categoryIds: Record<string, string>;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
  const res = await h.app.inject({
    method: 'GET',
    url: '/api/categories',
    headers: withSession(ownerToken),
  });
  categoryIds = Object.fromEntries(
    res.json().categories.map((c: { name: string; id: string }) => [c.name, c.id]),
  );
});

afterEach(async () => {
  await h.close();
});

/** Indomie: stock in pcs, sold per pcs (primary) and per dus of 40. */
const indomie = () => ({
  code: 'IDM-GRG',
  name: 'Indomie Goreng',
  categoryId: categoryIds.Sembako,
  type: 'unit',
  baseUnit: 'pcs',
  costPrice: 2900,
  units: [
    { name: 'pcs', isi: 1, sellPrice: 3500, isBase: true },
    { name: 'dus', isi: 40, sellPrice: 130000, isBase: false },
  ],
});

/** Gula pasir: stock in gram, sold per kg. */
const gula = () => ({
  code: 'GULA',
  name: 'Gula Pasir',
  categoryId: categoryIds.Sembako,
  type: 'bulk',
  baseUnit: 'gram',
  costPrice: 15000,
  units: [{ name: 'kg', isi: 1000, sellPrice: 17500, isBase: true }],
});

/** Rokok: a pyramid of Ball > Slop > Bungkus, stock counted in bungkus (docs/design.md 4.1.1). */
const rokok = () => ({
  code: 'SRT-12',
  name: 'Surya 12',
  categoryId: categoryIds.Rokok,
  type: 'unit',
  baseUnit: 'Bungkus',
  unitMode: 'pyramid',
  units: [
    { name: 'Ball', sellPrice: 420_000, costPrice: 400_000 },
    { name: 'Slop', isi: 20, sellPrice: 21_500 },
    { name: 'Bungkus', isi: 10, sellPrice: 2300 },
  ],
});

const post = (token: string, payload: object) =>
  h.app.inject({ method: 'POST', url: '/api/products', headers: withSession(token), payload });
const put = (token: string, id: string, payload: object) =>
  h.app.inject({
    method: 'PUT',
    url: `/api/products/${id}`,
    headers: withSession(token),
    payload,
  });
const setActive = (token: string, id: string, active: boolean) =>
  h.app.inject({
    method: 'PATCH',
    url: `/api/products/${id}/active`,
    headers: withSession(token),
    payload: { active },
  });
const get = (token: string, url: string) =>
  h.app.inject({ method: 'GET', url, headers: withSession(token) });

async function created(payload: object, token = ownerToken): Promise<Product> {
  const res = await post(token, payload);
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.statusCode} ${res.body}`);
  return res.json().product;
}

/** The update body that keeps a product as it is. */
const asInput = asProductInput;

const count = (table: string) =>
  (h.handle.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

describe('POST /api/products', () => {
  it('requires a session', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/api/products', payload: indomie() });
    expect(res.statusCode).toBe(401);
  });

  it('creates a multi-unit product, largest unit first', async () => {
    const res = await post(ownerToken, indomie());
    expect(res.statusCode).toBe(201);
    expect(res.json().product).toMatchObject({
      code: 'IDM-GRG',
      categoryName: 'Sembako',
      type: 'unit',
      baseUnit: 'pcs',
      pricingFactor: 1,
      costPrice: 2900,
      stock: 0,
      active: true,
      unitMode: 'flat',
      unitChain: [],
      units: [
        { name: 'dus', isi: 40, factor: 40, sellPrice: 130000, isBase: false, level: 1 },
        { name: 'pcs', isi: 1, factor: 1, sellPrice: 3500, isBase: true, level: 2 },
      ],
    });
  });

  it('creates a bulk product priced per kg with pricing factor 1000', async () => {
    const product = await created({
      ...gula(),
      baseUnit: 'Gram',
      units: [{ ...gula().units[0], name: 'KG' }],
    });
    expect(product).toMatchObject({
      baseUnit: 'gram',
      pricingFactor: 1000,
      units: [
        { name: 'kg', isi: 1000, factor: 1000, costPrice: 15000, sellPrice: 17500, isBase: true },
      ],
    });
  });

  it('records initial stock as an adjustment with a movement', async () => {
    const product = await created({ ...gula(), initialStock: 25000 });
    expect(product.stock).toBe(25000);
    expect(sumMovements(h.handle.db, product.id)).toBe(25000);
    const adjustment = h.handle.sqlite
      .prepare('select qty_change, reason, note, cost_price from stock_adjustments')
      .get();
    expect(adjustment).toEqual({
      qty_change: 25000,
      reason: 'lainnya',
      note: 'Stok awal',
      cost_price: 15000,
    });
    const movement = h.handle.sqlite.prepare('select type, qty_change from stock_movements').get();
    expect(movement).toEqual({ type: 'adjustment', qty_change: 25000 });
  });

  it('writes no adjustment when initial stock is 0', async () => {
    await created(indomie());
    expect(count('stock_adjustments')).toBe(0);
    expect(count('stock_movements')).toBe(0);
  });

  it('audits the product and each unit row', async () => {
    const product = await created(indomie());
    expect(auditRows(h, 'product')).toMatchObject([
      { entityId: product.id, action: 'create', newValue: { code: 'IDM-GRG', costPrice: 2900 } },
    ]);
    expect(auditRows(h, 'product_unit').map((r) => [r.action, r.newValue.name])).toEqual([
      ['create', 'dus'],
      ['create', 'pcs'],
    ]);
  });

  it('keeps codes unique ignoring case, including inactive products', async () => {
    const product = await created(indomie());
    await setActive(ownerToken, product.id, false);
    const res = await post(ownerToken, { ...gula(), code: 'idm-grg' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PRODUCT_CODE_TAKEN');
  });

  it.each([
    ['no primary unit', { units: [{ name: 'pcs', isi: 1, sellPrice: 1, isBase: false }] }],
    [
      'two primary units',
      {
        units: [
          { name: 'pcs', isi: 1, sellPrice: 1, isBase: true },
          { name: 'pak', isi: 10, sellPrice: 9, isBase: true },
        ],
      },
    ],
    [
      'duplicate unit names',
      {
        units: [
          { name: 'pcs', isi: 1, sellPrice: 1, isBase: true },
          { name: 'PCS', isi: 10, sellPrice: 9, isBase: false },
        ],
      },
    ],
    ['gram stock on a normal product', { baseUnit: 'gram' }],
  ])('rejects a normal product with %s', async (_, change) => {
    const res = await post(ownerToken, { ...indomie(), ...change });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UNITS');
  });

  it.each([
    ['a pcs stock unit', { baseUnit: 'pcs' }],
    [
      'a second unit',
      {
        units: [
          { name: 'kg', isi: 1000, sellPrice: 17500, isBase: true },
          { name: 'ons', isi: 100, sellPrice: 1800, isBase: false },
        ],
      },
    ],
    ['a factor other than 1000', { units: [{ name: 'kg', isi: 100, sellPrice: 1, isBase: true }] }],
    [
      'liter on a gram product',
      { units: [{ name: 'liter', isi: 1000, sellPrice: 1, isBase: true }] },
    ],
  ])('rejects a bulk product with %s', async (_, change) => {
    const res = await post(ownerToken, { ...gula(), ...change });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UNITS');
  });

  it('rejects fractional prices', async () => {
    const res = await post(ownerToken, { ...indomie(), costPrice: 2900.5 });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown and inactive categories', async () => {
    expect((await post(ownerToken, { ...indomie(), categoryId: 'nope' })).statusCode).toBe(404);
    const cat = await h.app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: withSession(ownerToken),
      payload: { name: 'Lama' },
    });
    const id = cat.json().category.id;
    await h.app.inject({
      method: 'PUT',
      url: `/api/categories/${id}`,
      headers: withSession(ownerToken),
      payload: { active: false },
    });
    const res = await post(ownerToken, { ...indomie(), categoryId: id });
    expect(res.json().error.code).toBe('CATEGORY_INACTIVE');
  });

  it('lets cashiers create products with their prices', async () => {
    const { token } = await activeCashier(h, ownerToken);
    expect((await post(token, indomie())).statusCode).toBe(201);
  });

  it('leaves no partial rows when a write fails mid-transaction', async () => {
    h.handle.sqlite.exec(
      "create trigger fail_movement before insert on stock_movements begin select raise(abort, 'boom'); end",
    );
    const res = await post(ownerToken, { ...gula(), initialStock: 1000 });
    expect(res.statusCode).toBe(500);
    for (const table of ['products', 'product_units', 'stock_adjustments', 'audit_logs']) {
      const where = table === 'audit_logs' ? " where entity like 'product%'" : '';
      const n = h.handle.sqlite.prepare(`select count(*) as n from ${table}${where}`).get() as {
        n: number;
      };
      expect([table, n.n]).toEqual([table, 0]);
    }
  });
});

describe('POST /api/products (unit pyramid)', () => {
  it('stores one chain, computes every factor, and takes the stock unit from the deepest level', async () => {
    const product = await created(rokok());
    expect(product).toMatchObject({
      type: 'unit',
      baseUnit: 'Bungkus',
      pricingFactor: 1,
      unitMode: 'pyramid',
      // Cost of one base unit: 400.000 / 20 / 10.
      costPrice: 2000,
      units: [
        { name: 'Ball', level: 1, isi: 1, factor: 200, costPrice: 400_000, isBase: false },
        { name: 'Slop', level: 2, isi: 20, factor: 10, costPrice: 20_000, isBase: false },
        { name: 'Bungkus', level: 3, isi: 10, factor: 1, costPrice: 2000, isBase: true },
      ],
      unitChain: [
        { name: 'Ball', factor: 200 },
        { name: 'Slop', factor: 10 },
        { name: 'Bungkus', factor: 1 },
      ],
    });
    const parents = product.units.map((u) => u.parentUnitId);
    expect(parents).toEqual([null, product.units[0]?.id, product.units[1]?.id]);
  });

  it('rounds the cost of a level up', async () => {
    const product = await created({
      ...rokok(),
      units: [
        { name: 'Dus', sellPrice: 100_000, costPrice: 10_000 },
        { name: 'Pak', isi: 7, sellPrice: 20_000 },
        { name: 'Sachet', isi: 3, sellPrice: 1000 },
      ],
      baseUnit: 'Sachet',
    });
    // 10.000 / 7 = 1428,57 -> 1429; 1429 / 3 = 476,33 -> 477.
    expect(product.units.map((u) => u.costPrice)).toEqual([10_000, 1429, 477]);
    expect(product.costPrice).toBe(477);
  });

  it('keeps a single-level pyramid as its own stock unit', async () => {
    const product = await created({
      ...rokok(),
      baseUnit: 'pcs',
      units: [{ name: 'pcs', sellPrice: 3500, costPrice: 2900 }],
    });
    expect(product).toMatchObject({
      baseUnit: 'pcs',
      costPrice: 2900,
      units: [{ name: 'pcs', level: 1, isi: 1, factor: 1, isBase: true }],
    });
  });

  it.each([
    [
      'a sell price below the level cost',
      {
        units: [
          { name: 'Ball', sellPrice: 420_000, costPrice: 400_000 },
          { name: 'Slop', isi: 20, sellPrice: 19_000 },
        ],
      },
    ],
    [
      'an isi below 2',
      {
        units: [
          { name: 'Ball', sellPrice: 420_000, costPrice: 400_000 },
          { name: 'Slop', isi: 1, sellPrice: 21_500 },
        ],
      },
    ],
    [
      'the same name twice',
      {
        units: [
          { name: 'Slop', sellPrice: 420_000, costPrice: 400_000 },
          { name: 'slop', isi: 20, sellPrice: 21_500 },
        ],
      },
    ],
    [
      'a bulk stock unit',
      {
        units: [
          { name: 'kg', sellPrice: 20_000, costPrice: 15_000 },
          { name: 'gram', isi: 1000, sellPrice: 25 },
        ],
      },
    ],
  ])('refuses %s', async (_, patch) => {
    const res = await post(ownerToken, { ...rokok(), ...patch });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UNITS');
    expect(count('products')).toBe(0);
  });

  it('refuses more than five levels', async () => {
    const res = await post(ownerToken, {
      ...rokok(),
      baseUnit: 'l6',
      units: [
        { name: 'l1', sellPrice: 100_000, costPrice: 90_000 },
        ...[2, 3, 4, 5, 6].map((n) => ({ name: `l${n}`, isi: 2, sellPrice: 100_000 })),
      ],
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses a top unit larger than the factor limit', async () => {
    const res = await post(ownerToken, {
      ...rokok(),
      baseUnit: 'l3',
      units: [
        { name: 'l1', sellPrice: 100_000, costPrice: 90_000 },
        { name: 'l2', isi: 1000, sellPrice: 100 },
        { name: 'l3', isi: 1001, sellPrice: 1 },
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UNITS');
  });

  it('prices sales and purchases by the computed factor', async () => {
    const product = await created({ ...rokok(), initialStock: 3806 });
    expect(product.stock).toBe(3806);
    const slop = product.units[1];
    const sale = await h.app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: withSession(ownerToken),
      payload: {
        id: '7a4f3e6c-1d2b-4c8a-9f10-2a3b4c5d6e7f',
        lines: [{ productId: product.id, unitId: slop?.id, qtyBase: 30 }],
        cash: 100_000,
        qris: 0,
        expectedTotal: 64_500,
      },
    });
    expect(sale.statusCode).toBe(201);
    expect(sale.json().sale.items[0]).toMatchObject({
      unitName: 'Slop',
      unitFactor: 10,
      qtyBase: 30,
      subtotal: 64_500,
    });
    // Cost of goods sold follows the deepest level's cost: 30 bungkus x Rp 2.000.
    expect(h.handle.sqlite.prepare('select cost_price, cost_total from sale_items').get()).toEqual({
      cost_price: 2000,
      cost_total: 60_000,
    });
  });
});

describe('PUT /api/products/:id (unit pyramid)', () => {
  it('adds a level above the chain and recomputes the levels below it', async () => {
    const product = await created(rokok());
    const input = asInput(product);
    const res = await put(ownerToken, product.id, {
      ...input,
      units: [
        { name: 'Karton', isi: 1, sellPrice: 1_700_000, costPrice: 1_600_000 },
        ...(input.units ?? [])
          .map((u) => ({ ...u, costPrice: undefined, isi: u.isi ?? 1 }))
          .map((u, index) => (index === 0 ? { ...u, isi: 4 } : u)),
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({
      baseUnit: 'Bungkus',
      costPrice: 2000,
      units: [
        { name: 'Karton', level: 1, factor: 800 },
        { name: 'Ball', level: 2, isi: 4, factor: 200, costPrice: 400_000 },
        { name: 'Slop', level: 3, isi: 20, factor: 10 },
        { name: 'Bungkus', level: 4, isi: 10, factor: 1 },
      ],
    });
  });

  it('refuses a new level below the stock unit once the product has stock', async () => {
    const product = await created({ ...rokok(), initialStock: 100 });
    const input = asInput(product);
    const res = await put(ownerToken, product.id, {
      ...input,
      baseUnit: 'Batang',
      units: [...(input.units ?? []), { name: 'Batang', isi: 12, sellPrice: 250 }],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('STOCK_UNIT_LOCKED');
  });

  it('turns a flat product into a pyramid while it has no stock', async () => {
    const product = await created(indomie());
    const res = await put(ownerToken, product.id, {
      ...asInput(product),
      unitMode: 'pyramid',
      costPrice: undefined,
      baseUnit: 'pcs',
      units: [
        { name: 'dus', isi: 1, sellPrice: 130_000, costPrice: 116_000 },
        { name: 'pcs', isi: 40, sellPrice: 3500 },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({
      unitMode: 'pyramid',
      baseUnit: 'pcs',
      costPrice: 2900,
      units: [
        { name: 'dus', level: 1, factor: 40 },
        { name: 'pcs', level: 2, factor: 1, costPrice: 2900, isBase: true },
      ],
    });
  });
});

describe('PUT /api/products/:id', () => {
  it('updates fields and units; left-out rows are deactivated; all audited', async () => {
    const product = await created(indomie());
    const pcs = product.units.find((u) => u.isBase);
    const res = await put(ownerToken, product.id, {
      ...asInput(product),
      name: 'Indomie Goreng Original',
      costPrice: 3000,
      units: [
        { id: pcs?.id, name: 'pcs', isi: 1, sellPrice: 3700, isBase: true },
        { name: 'pak', isi: 5, sellPrice: 17500, isBase: false },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({
      name: 'Indomie Goreng Original',
      costPrice: 3000,
      units: [
        { name: 'pak', isi: 5, sellPrice: 17500 },
        { id: pcs?.id, name: 'pcs', sellPrice: 3700 },
      ],
    });
    expect(auditRows(h, 'product').at(-1)).toMatchObject({
      action: 'update',
      oldValue: { name: 'Indomie Goreng', costPrice: 2900 },
      newValue: { name: 'Indomie Goreng Original', costPrice: 3000 },
    });
    expect(
      auditRows(h, 'product_unit')
        .slice(2)
        .map((r) => [r.action, r.newValue.name]),
    ).toEqual([
      ['deactivate', 'dus'],
      ['create', 'pak'],
      ['update', 'pcs'],
    ]);
  });

  it('writes no audit rows when nothing changed', async () => {
    const product = await created(indomie());
    const before = count('audit_logs');
    expect((await put(ownerToken, product.id, asInput(product))).statusCode).toBe(200);
    expect(count('audit_logs')).toBe(before);
  });

  it('allows changing the code to a free one and rejects a taken one', async () => {
    const a = await created(indomie());
    await created(gula());
    expect((await put(ownerToken, a.id, { ...asInput(a), code: 'IDM-1' })).statusCode).toBe(200);
    const res = await put(ownerToken, a.id, { ...asInput(a), code: 'gula' });
    expect(res.json().error.code).toBe('PRODUCT_CODE_TAKEN');
  });

  it('rejects unit ids of another product', async () => {
    const a = await created(indomie());
    const b = await created(gula());
    const input = asInput(a);
    const res = await put(ownerToken, a.id, {
      ...input,
      units: [{ ...input.units[0], id: b.units[0]?.id }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UNITS');
  });

  it('returns 404 for an unknown product', async () => {
    const product = await created(indomie());
    expect((await put(ownerToken, 'nope', asInput(product))).statusCode).toBe(404);
  });
});

describe('stock unit lock', () => {
  const expectLocked = (res: {
    statusCode: number;
    json(): { error: { code: string; message: string } };
  }) => {
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('STOCK_UNIT_LOCKED');
    expect(res.json().error.message).toMatch(/buat barang baru/);
  };

  it('reports whether a product has stock movements', async () => {
    expect((await created(indomie())).hasStockMovements).toBe(false);
    expect((await created({ ...gula(), initialStock: 1000 })).hasStockMovements).toBe(true);
  });

  it('blocks changing the type once stock moved', async () => {
    const product = await created({ ...indomie(), initialStock: 10 });
    expectLocked(
      await put(ownerToken, product.id, {
        ...asInput(product),
        type: 'bulk',
        baseUnit: 'gram',
        units: [{ name: 'kg', isi: 1000, sellPrice: 20000, isBase: true }],
      }),
    );
  });

  it('blocks switching a bulk product between gram and ml once stock moved', async () => {
    const product = await created({ ...gula(), initialStock: 1000 });
    const input = asInput(product);
    expectLocked(
      await put(ownerToken, product.id, {
        ...input,
        baseUnit: 'ml',
        units: input.units.map((u) => ({ ...u, name: 'liter' })),
      }),
    );
  });

  it('still allows renaming the stock unit label of a normal product', async () => {
    const product = await created({ ...indomie(), initialStock: 10 });
    const res = await put(ownerToken, product.id, { ...asInput(product), baseUnit: 'bks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({ baseUnit: 'bks', stock: 10 });
  });

  it('allows changing the type while no stock has moved', async () => {
    const product = await created(indomie());
    const res = await put(ownerToken, product.id, {
      ...asInput(product),
      type: 'bulk',
      baseUnit: 'gram',
      units: [{ name: 'kg', isi: 1000, sellPrice: 20000, isBase: true }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({ type: 'bulk', pricingFactor: 1000 });
  });
});

describe('cashier limits', () => {
  let cashierToken: string;
  let product: Product;

  beforeEach(async () => {
    ({ token: cashierToken } = await activeCashier(h, ownerToken));
    product = await created(indomie());
  });

  it('allows non-price edits: code, name, category, unit name and isi, removing a row', async () => {
    const input = asInput(product);
    const pcs = input.units.find((u) => u.isBase);
    const res = await put(cashierToken, product.id, {
      ...input,
      code: 'IDM-G',
      name: 'Mi Goreng',
      categoryId: categoryIds['Lain-lain'],
      units: [{ ...pcs, name: 'bks' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({
      code: 'IDM-G',
      name: 'Mi Goreng',
      categoryName: 'Lain-lain',
      units: [{ name: 'bks', sellPrice: 3500 }],
    });
  });

  it.each([
    ['the cost price', (i: ReturnType<typeof asInput>) => ({ ...i, costPrice: 1 })],
    [
      'a sell price',
      (i: ReturnType<typeof asInput>) => ({
        ...i,
        units: i.units.map((u) => ({ ...u, sellPrice: u.sellPrice + 100 })),
      }),
    ],
    [
      'a new unit row',
      (i: ReturnType<typeof asInput>) => ({
        ...i,
        units: [...i.units, { name: 'pak', isi: 5, sellPrice: 17000, isBase: false }],
      }),
    ],
  ])('needs owner approval to change %s', async (_, change) => {
    const res = await put(cashierToken, product.id, change(asInput(product)));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    expect((await get(ownerToken, `/api/products/${product.id}`)).json().product).toEqual(product);
  });

  it('needs owner approval to deactivate but may reactivate', async () => {
    const res = await setActive(cashierToken, product.id, false);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    await setActive(ownerToken, product.id, false);
    const reactivated = await setActive(cashierToken, product.id, true);
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json().product.active).toBe(true);
  });
});

describe('PATCH /api/products/:id/active', () => {
  it('deactivates and reactivates, audited', async () => {
    const product = await created(indomie());
    expect((await setActive(ownerToken, product.id, false)).json().product.active).toBe(false);
    await setActive(ownerToken, product.id, true);
    expect(auditRows(h, 'product').map((r) => r.action)).toEqual([
      'create',
      'deactivate',
      'activate',
    ]);
  });
});

describe('GET /api/products/by-code/:code', () => {
  it('finds an active product ignoring case', async () => {
    await created(indomie());
    const res = await get(ownerToken, '/api/products/by-code/idm-grg');
    expect(res.statusCode).toBe(200);
    expect(res.json().product.name).toBe('Indomie Goreng');
  });

  it('reports inactive and unknown codes as not found', async () => {
    const product = await created(indomie());
    await setActive(ownerToken, product.id, false);
    const res = await get(ownerToken, '/api/products/by-code/IDM-GRG');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toEqual({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Barang tidak ditemukan.',
    });
  });
});

describe('GET /api/products', () => {
  /** Creates 100 products: 60 Sembako "Beras ...", 40 Rokok "Rokok ...". */
  async function seedHundred() {
    for (let i = 1; i <= 100; i++) {
      const rokok = i > 60;
      await created({
        code: `P${String(i).padStart(3, '0')}`,
        name: `${rokok ? 'Rokok Merek' : 'Beras Cap'} ${i}`,
        categoryId: rokok ? categoryIds.Rokok : categoryIds.Sembako,
        type: 'unit',
        baseUnit: rokok ? 'batang' : 'pcs',
        costPrice: 1000 + i,
        units: [
          {
            name: rokok ? 'bungkus' : 'pcs',
            isi: rokok ? 16 : 1,
            sellPrice: 1500 + i,
            isBase: true,
          },
        ],
        initialStock: i,
      });
    }
  }

  const search = async (query: string) => {
    const res = await get(ownerToken, `/api/products?${query}`);
    expect(res.statusCode).toBe(200);
    return res.json() as { products: Product[]; total: number; page: number; limit: number };
  };

  it('stores 100 products and finds them by code, name, category, and page', async () => {
    await seedHundred();

    const all = await search('limit=100');
    expect(all.total).toBe(100);
    expect(all.products).toHaveLength(100);

    const page = await search('page=3&limit=25');
    expect(page).toMatchObject({ total: 100, page: 3, limit: 25 });
    expect(page.products).toHaveLength(25);

    expect((await search('q=P042')).products.map((p) => p.name)).toEqual(['Beras Cap 42']);
    expect((await search('q=merek%2099')).products.map((p) => p.code)).toEqual(['P099']);
    expect((await search('q=beras')).total).toBe(60);
    expect((await search(`categoryId=${categoryIds.Rokok}`)).total).toBe(40);
    expect((await search(`q=cap&categoryId=${categoryIds.Rokok}`)).total).toBe(0);

    const p7 = (await search('q=P007')).products[0];
    expect(p7).toMatchObject({ stock: 7, units: [{ name: 'pcs', sellPrice: 1507 }] });
  });

  it('ranks an exact code match first', async () => {
    await created({ ...indomie(), code: 'A1', name: 'Zebra' });
    await created({ ...gula(), code: 'A10', name: 'Apel A1' });
    expect((await search('q=a1')).products.map((p) => p.code)).toEqual(['A1', 'A10']);
  });

  it('treats % and _ in the query literally', async () => {
    await created(indomie());
    expect((await search('q=%25')).total).toBe(0);
    expect((await search('q=_')).total).toBe(0);
  });

  it('filters by status, active by default', async () => {
    const a = await created(indomie());
    await created(gula());
    await setActive(ownerToken, a.id, false);
    expect((await search('')).products.map((p) => p.code)).toEqual(['GULA']);
    expect((await search('status=inactive')).products.map((p) => p.code)).toEqual(['IDM-GRG']);
    expect((await search('status=all')).total).toBe(2);
  });

  it('rejects an invalid page size', async () => {
    const res = await get(ownerToken, '/api/products?limit=1000');
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
