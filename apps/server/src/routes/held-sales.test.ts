import type { Product, Sale } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteExpiredHeldSales } from '../services/sale-service';
import {
  asProductInput,
  auditRows,
  createHarness,
  createProductAs,
  type Harness,
  serviceContext,
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
let kopi: Product;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
  indomie = await createProductAs(h, ownerToken, {
    code: 'IDM',
    name: 'Indomie Goreng',
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'pcs',
    costPrice: 2900,
    units: [{ name: 'pcs', isi: 1, sellPrice: 3500, isBase: true }],
    initialStock: 10,
  });
  kopi = await createProductAs(h, ownerToken, {
    code: 'KOPI',
    name: 'Kopi Kapal Api',
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'sachet',
    costPrice: 1200,
    units: [{ name: 'sachet', isi: 1, sellPrice: 1500, isBase: true }],
    initialStock: 10,
  });
});

afterEach(async () => {
  await h.close();
});

const lines = () => [
  { productId: indomie.id, unitId: indomie.units[0]?.id, qtyBase: 2 },
  { productId: kopi.id, unitId: kopi.units[0]?.id, qtyBase: 3 },
];

const api = (method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH', url: string, payload?: object) =>
  h.app.inject({ method, url, headers: withSession(ownerToken), ...(payload ? { payload } : {}) });

async function hold(): Promise<Sale> {
  const res = await api('POST', '/api/sales/held', { id: crypto.randomUUID(), lines: lines() });
  if (res.statusCode !== 201) throw new Error(`hold failed: ${res.statusCode} ${res.body}`);
  return res.json().sale;
}

const heldList = async () => (await api('GET', '/api/sales/held')).json().heldSales as Sale[];

const stockOf = async (p: Product) =>
  (await api('GET', `/api/products/${p.id}`)).json().product.stock as number;

describe('holding a sale', () => {
  it('stores it without a number and without touching stock', async () => {
    const held = await hold();
    expect(held).toMatchObject({ status: 'held', number: null, total: 11500, itemCount: 2 });
    expect(await stockOf(indomie)).toBe(10);
    expect((await heldList()).map((s) => s.id)).toEqual([held.id]);
  });

  it('is not listed in the transaction history', async () => {
    await hold();
    expect((await api('GET', '/api/sales')).json().total).toBe(0);
  });
});

describe('POST /api/sales/held/:id/resume', () => {
  it('returns lines with current prices and the held price, and removes the held sale', async () => {
    const held = await hold();
    const input = {
      ...asProductInput(kopi),
      units: (asProductInput(kopi).units as Record<string, unknown>[]).map((u) => ({
        ...u,
        sellPrice: 1700,
      })),
    };
    await api('PUT', `/api/products/${kopi.id}`, input);

    const res = await api('POST', `/api/sales/held/${held.id}/resume`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.removed).toEqual([]);
    expect(
      body.lines.map((l: { product: Product; qtyBase: number; heldUnitPrice: number }) => [
        l.product.name,
        l.qtyBase,
        l.heldUnitPrice,
        l.product.units[0]?.sellPrice,
      ]),
    ).toEqual([
      ['Indomie Goreng', 2, 3500, 3500],
      ['Kopi Kapal Api', 3, 1500, 1700],
    ]);
    expect(await heldList()).toEqual([]);
    // Taking a sale back is not a deletion.
    expect(auditRows(h, 'held_sale')).toEqual([]);
  });

  it('drops lines of deactivated products and names them', async () => {
    const held = await hold();
    await api('PATCH', `/api/products/${kopi.id}/active`, { active: false });
    const body = (await api('POST', `/api/sales/held/${held.id}/resume`)).json();
    expect(body.removed).toEqual(['Kopi Kapal Api']);
    expect(body.lines).toHaveLength(1);
  });

  it('returns 404 for unknown or completed sales', async () => {
    expect((await api('POST', '/api/sales/held/nope/resume')).statusCode).toBe(404);
  });
});

describe('deleting held sales', () => {
  it('deletes one, audit-logged', async () => {
    const held = await hold();
    const res = await api('DELETE', `/api/sales/held/${held.id}`);
    expect(res.json()).toEqual({ deleted: 1 });
    expect(await heldList()).toEqual([]);
    expect(h.handle.sqlite.prepare('select count(*) as n from sale_items').get()).toEqual({ n: 0 });
    expect(auditRows(h, 'held_sale')).toMatchObject([
      {
        entityId: held.id,
        action: 'delete',
        oldValue: { total: 11500, items: [{ productCode: 'IDM' }, { productCode: 'KOPI' }] },
      },
    ]);
  });

  it('bulk-deletes the ones from earlier local days ("kemarin") only', async () => {
    h.clock.now = new Date('2026-10-21T16:30:00.000Z'); // 23:30 on the 21st, WIB
    const yesterday = await hold();
    h.clock.now = new Date('2026-10-21T17:30:00.000Z'); // 00:30 on the 22nd, WIB
    const today = await hold();
    const res = await api('DELETE', '/api/sales/held?before=2026-10-22');
    expect(res.json()).toEqual({ deleted: 1 });
    expect((await heldList()).map((s) => s.id)).toEqual([today.id]);
    expect(auditRows(h, 'held_sale').map((r) => r.entityId)).toEqual([yesterday.id]);
  });

  it('rejects a malformed day', async () => {
    const res = await api('DELETE', '/api/sales/held?before=kemarin');
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes held sales older than 7 days on server start, without a user', async () => {
    h.clock.now = new Date('2026-10-14T07:00:00.000Z');
    const old = await hold();
    h.clock.now = new Date('2026-10-16T07:00:00.000Z');
    const recent = await hold();
    h.clock.now = new Date('2026-10-22T08:00:00.000Z');
    expect(deleteExpiredHeldSales(serviceContext(h))).toBe(1);
    expect((await heldList()).map((s) => s.id)).toEqual([recent.id]);
    expect(auditRows(h, 'held_sale')).toMatchObject([
      { entityId: old.id, action: 'auto_delete', userId: null },
    ]);
  });
});
