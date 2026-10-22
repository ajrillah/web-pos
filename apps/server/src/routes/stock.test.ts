import type { Category, Movement, Opname, Product } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeCashier,
  createHarness,
  createProductAs,
  type Harness,
  setupOwner,
  withSession,
} from '../testing/harness';

beforeAll(() => {
  vi.stubEnv('TZ', 'Asia/Jakarta');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

let h: Harness;
let ownerToken: string;
let indomie: Product;
let gula: Product;
let rokok: Product;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
  indomie = await createProductAs(h, ownerToken, {
    code: 'IDM',
    name: 'Indomie Goreng',
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'pcs',
    costPrice: 2500,
    units: [{ name: 'pcs', factor: 1, sellPrice: 3500, isBase: true }],
    initialStock: 20,
  });
  gula = await createProductAs(h, ownerToken, {
    code: 'GL',
    name: 'Gula Pasir',
    category: 'Sembako',
    type: 'bulk',
    baseUnit: 'gram',
    costPrice: 14000,
    units: [{ name: 'kg', factor: 1000, sellPrice: 17000, isBase: true }],
    initialStock: 5000,
  });
  rokok = await createProductAs(h, ownerToken, {
    code: 'SMP',
    name: 'Sampoerna Mild',
    category: 'Rokok',
    type: 'unit',
    baseUnit: 'bks',
    costPrice: 30000,
    units: [{ name: 'bks', factor: 1, sellPrice: 33000, isBase: true }],
    initialStock: 8,
  });
});

afterEach(async () => {
  await h.close();
});

const api = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, token = ownerToken) =>
  h.app.inject({ method, url, headers: withSession(token), ...(payload ? { payload } : {}) });

const stockOf = async (product: Product) =>
  (await api('GET', `/api/products/${product.id}`)).json().product.stock as number;

async function categoryId(name: string): Promise<string> {
  const res = await api('GET', '/api/categories');
  return res.json().categories.find((c: Category) => c.name === name)?.id;
}

async function startOpname(category: string, token = ownerToken) {
  return api('POST', '/api/stock-opname', { categoryId: await categoryId(category) }, token);
}

async function sell(product: Product, qtyBase: number) {
  const unit = product.units[0];
  const total = Math.round((qtyBase * (unit?.sellPrice ?? 0)) / (unit?.factor ?? 1));
  const res = await api('POST', '/api/sales', {
    id: crypto.randomUUID(),
    lines: [{ productId: product.id, unitId: unit?.id, qtyBase }],
    cash: total,
    qris: 0,
    expectedTotal: total,
  });
  if (res.statusCode !== 201) throw new Error(`sale failed: ${res.statusCode} ${res.body}`);
}

function reconcileStock() {
  const rows = h.handle.sqlite
    .prepare(
      `select p.code, p.stock, coalesce((select sum(m.qty_change) from stock_movements m
        where m.product_id = p.id), 0) as moved from products p`,
    )
    .all() as { code: string; stock: number; moved: number }[];
  for (const row of rows) expect(row.stock, row.code).toBe(row.moved);
}

describe('stock adjustments', () => {
  it('records the reason and current cost, allows negative stock with a warning', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const res = await api(
      'POST',
      '/api/stock-adjustments',
      { productId: rokok.id, qtyChange: -10, reason: 'hilang', note: 'Dicek malam' },
      token,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().adjustment).toMatchObject({
      productCode: 'SMP',
      qtyChange: -10,
      reason: 'hilang',
      note: 'Dicek malam',
      costPrice: 30000,
      userName: 'Rina',
    });
    expect(res.json().warnings).toEqual([
      { productId: rokok.id, productName: 'Sampoerna Mild', stock: -2, baseUnit: 'bks' },
    ]);
    expect(await stockOf(rokok)).toBe(-2);
    const list = (await api('GET', `/api/stock-adjustments?productId=${rokok.id}`)).json();
    // The initial stock is an adjustment too; newest first.
    expect(list.adjustments.map((a: { qtyChange: number }) => a.qtyChange)).toEqual([-10, 8]);
    reconcileStock();
  });

  it('validates quantity, reason, and the note for "lainnya"', async () => {
    const code = async (body: object) =>
      (await api('POST', '/api/stock-adjustments', { productId: indomie.id, ...body })).json().error
        ?.code;
    expect(await code({ qtyChange: 0, reason: 'rusak' })).toBe('VALIDATION_ERROR');
    expect(await code({ qtyChange: 1.5, reason: 'rusak' })).toBe('VALIDATION_ERROR');
    expect(await code({ qtyChange: -1, reason: 'dicuri' })).toBe('VALIDATION_ERROR');
    expect(await code({ qtyChange: -1, reason: 'lainnya' })).toBe('VALIDATION_ERROR');
    expect(await code({ qtyChange: -1, reason: 'lainnya', note: 'Dimakan' })).toBeUndefined();
    const missing = await api('POST', '/api/stock-adjustments', {
      productId: 'nope',
      qtyChange: 1,
      reason: 'rusak',
    });
    expect(missing.json().error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('stock opname', () => {
  it('counts a category and applies counted - start to current stock on completion', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const start = await startOpname('Sembako', token);
    expect(start.statusCode).toBe(201);
    const opname = start.json().opname as Opname;
    expect(opname).toMatchObject({ status: 'open', categoryName: 'Sembako', itemCount: 2 });
    expect(opname.items.map((i) => [i.productCode, i.systemQtyAtStart, i.countedQty])).toEqual([
      ['GL', 5000, null],
      ['IDM', 20, null],
    ]);

    // Sales continue during the session.
    await sell(indomie, 3);
    const counted = await api(
      'PUT',
      `/api/stock-opname/${opname.id}/items`,
      { items: [{ productId: indomie.id, countedQty: 18 }] },
      token,
    );
    const item = counted
      .json()
      .opname.items.find((i: { productId: string }) => i.productId === indomie.id);
    expect(item).toMatchObject({ countedQty: 18, delta: -2, currentStock: 17 });

    // The adjustment is valued at the cost price when the session completes.
    await api('PUT', `/api/products/${indomie.id}`, {
      code: 'IDM',
      name: 'Indomie Goreng',
      categoryId: indomie.categoryId,
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: 2700,
      units: [{ id: indomie.units[0]?.id, name: 'pcs', factor: 1, sellPrice: 3500, isBase: true }],
    });
    const done = await api('POST', `/api/stock-opname/${opname.id}/complete`, undefined, token);
    expect(done.statusCode).toBe(200);
    expect(done.json().opname).toMatchObject({
      status: 'completed',
      closedByName: 'Rina',
      countedCount: 1,
    });
    // 20 at start, 3 sold, counted 18 -> delta -2 applied to 17.
    expect(await stockOf(indomie)).toBe(15);
    // Uncounted gula is unchanged.
    expect(await stockOf(gula)).toBe(5000);
    const adjustment = h.handle.sqlite
      .prepare(
        "select qty_change, reason, cost_price, note from stock_adjustments where reason = 'opname'",
      )
      .all();
    expect(adjustment).toEqual([
      { qty_change: -2, reason: 'opname', cost_price: 2700, note: 'Opname Sembako' },
    ]);

    const closed = await api('PUT', `/api/stock-opname/${opname.id}/items`, {
      items: [{ productId: gula.id, countedQty: 1 }],
    });
    expect(closed.json().error.code).toBe('OPNAME_NOT_OPEN');
    reconcileStock();
  });

  it('allows one open session per product, in parallel for other categories', async () => {
    const sembako = (await startOpname('Sembako')).json().opname as Opname;
    const again = await startOpname('Sembako');
    expect([again.statusCode, again.json().error.code]).toEqual([409, 'OPNAME_PRODUCT_BUSY']);
    expect((await startOpname('Rokok')).statusCode).toBe(201);

    // A product moved into another category while being counted stays in its session only.
    await api('PUT', `/api/products/${indomie.id}`, {
      code: 'IDM',
      name: 'Indomie Goreng',
      categoryId: await categoryId('Lain-lain'),
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: 2500,
      units: [{ id: indomie.units[0]?.id, name: 'pcs', factor: 1, sellPrice: 3500, isBase: true }],
    });
    const moved = await startOpname('Lain-lain');
    expect(moved.json().error.message).toContain('Indomie Goreng');

    const cancelled = await api('POST', `/api/stock-opname/${sembako.id}/cancel`);
    expect(cancelled.json().opname.status).toBe('cancelled');
    expect((await startOpname('Lain-lain')).statusCode).toBe(201);

    const list = (await api('GET', '/api/stock-opname')).json().opnames as Opname[];
    expect(list.map((o) => [o.categoryName, o.status])).toEqual([
      ['Lain-lain', 'open'],
      ['Rokok', 'open'],
      ['Sembako', 'cancelled'],
    ]);
    expect(await stockOf(indomie)).toBe(20);
  });

  it('refuses empty categories, unknown items, and closed sessions', async () => {
    const empty = await api('POST', '/api/categories', { name: 'Kosong' });
    const res = await api('POST', '/api/stock-opname', { categoryId: empty.json().category.id });
    expect(res.json().error.code).toBe('OPNAME_EMPTY');

    const opname = (await startOpname('Rokok')).json().opname as Opname;
    const unknown = await api('PUT', `/api/stock-opname/${opname.id}/items`, {
      items: [{ productId: indomie.id, countedQty: 1 }],
    });
    expect(unknown.json().error.code).toBe('OPNAME_UNKNOWN_ITEM');
    const negative = await api('PUT', `/api/stock-opname/${opname.id}/items`, {
      items: [{ productId: rokok.id, countedQty: -1 }],
    });
    expect(negative.json().error.code).toBe('VALIDATION_ERROR');
    await api('POST', `/api/stock-opname/${opname.id}/cancel`);
    const complete = await api('POST', `/api/stock-opname/${opname.id}/complete`);
    expect(complete.json().error.code).toBe('OPNAME_NOT_OPEN');
  });
});

describe('stock movement history', () => {
  it('lists movements newest first with references and the running stock', async () => {
    await sell(indomie, 2);
    await api('POST', '/api/stock-adjustments', {
      productId: indomie.id,
      qtyChange: -1,
      reason: 'rusak',
    });
    const res = (await api('GET', `/api/stock-movements?productId=${indomie.id}`)).json();
    expect(
      res.movements.map((m: Movement) => [
        m.type,
        m.qtyChange,
        m.balanceAfter,
        m.refNumber,
        m.reason,
      ]),
    ).toEqual([
      ['adjustment', -1, 17, null, 'rusak'],
      ['sale', -2, 18, 'TRX-20261022-0001', null],
      ['adjustment', 20, 20, null, 'lainnya'],
    ]);
    expect(res.total).toBe(3);

    const sales = (await api('GET', '/api/stock-movements?type=sale')).json();
    expect(sales.movements).toHaveLength(1);
    const all = (await api('GET', '/api/stock-movements?limit=2&page=2')).json();
    expect(all).toMatchObject({ total: 5, page: 2 });
    expect(all.movements).toHaveLength(2);
    const none = (await api('GET', '/api/stock-movements?from=2026-10-23')).json();
    expect(none.total).toBe(0);
    reconcileStock();
  });
});
