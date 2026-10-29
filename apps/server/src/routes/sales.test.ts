import { lineSubtotal, type Product, roundSaleTotal, type Sale } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSetting } from '../repositories/settings-repository';
import { sumMovements } from '../repositories/stock-repository';
import { createSale } from '../services/sale-service';
import {
  activeCashier,
  createHarness,
  createProductAs,
  type Harness,
  serviceContext,
  setupOwner,
  userIdOf,
  withSession,
} from '../testing/harness';

// The shop PC runs in WIB (UTC+7); TRX dates and "today" follow local time.
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
    costPrice: 2900,
    units: [
      { name: 'pcs', isi: 1, sellPrice: 3500, isBase: true },
      { name: 'dus', isi: 40, sellPrice: 130000, isBase: false },
    ],
    initialStock: 100,
  });
  gula = await createProductAs(h, ownerToken, {
    code: 'GULA',
    name: 'Gula Pasir',
    category: 'Sembako',
    type: 'bulk',
    baseUnit: 'gram',
    costPrice: 15000,
    units: [{ name: 'kg', isi: 1000, sellPrice: 17500, isBase: true }],
    initialStock: 10000,
  });
  rokok = await createProductAs(h, ownerToken, {
    code: 'SAM',
    name: 'Sampoerna Mild',
    category: 'Rokok',
    type: 'unit',
    baseUnit: 'batang',
    costPrice: 1900,
    units: [
      { name: 'bungkus', isi: 16, sellPrice: 33000, isBase: true },
      { name: 'batang', isi: 1, sellPrice: 2200, isBase: false },
    ],
    initialStock: 32,
  });
});

afterEach(async () => {
  await h.close();
});

const unit = (p: Product, name: string) => {
  const found = p.units.find((u) => u.name === name);
  if (!found) throw new Error(`no unit ${name}`);
  return found.id;
};

const line = (p: Product, unitName: string, qtyBase: number) => ({
  productId: p.id,
  unitId: unit(p, unitName),
  qtyBase,
});

const sell = (payload: object, token = ownerToken) =>
  h.app.inject({ method: 'POST', url: '/api/sales', headers: withSession(token), payload });

const sale = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  lines: [line(indomie, 'pcs', 2)],
  cash: 10000,
  qris: 0,
  expectedTotal: 7000,
  ...overrides,
});

const stockOf = async (p: Product) =>
  (
    await h.app.inject({
      method: 'GET',
      url: `/api/products/${p.id}`,
      headers: withSession(ownerToken),
    })
  ).json().product.stock as number;

const count = (table: string) =>
  (h.handle.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

describe('POST /api/sales', () => {
  it('requires a session', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/api/sales', payload: sale() });
    expect(res.statusCode).toBe(401);
  });

  it('completes a cash sale with number, snapshots, payment, change, and stock movements', async () => {
    const res = await sell(sale());
    expect(res.statusCode).toBe(201);
    const body = res.json() as { sale: Sale; warnings: unknown[] };
    expect(body.warnings).toEqual([]);
    expect(body.sale).toMatchObject({
      number: 'TRX-20261022-0001',
      status: 'completed',
      cashierName: 'Bu Sari',
      subtotal: 7000,
      roundingAmount: 0,
      total: 7000,
      paidTotal: 10000,
      changeAmount: 3000,
      debtAmount: 0,
      itemCount: 1,
      completedAt: '2026-10-22T08:00:00.000Z',
      items: [
        {
          productCode: 'IDM',
          productName: 'INDOMIE GORENG',
          unitName: 'pcs',
          qtyBase: 2,
          unitFactor: 1,
          unitPrice: 3500,
          subtotal: 7000,
        },
      ],
      payments: [{ method: 'cash', amount: 10000 }],
    });
    expect(await stockOf(indomie)).toBe(98);
    expect(sumMovements(h.handle.db, indomie.id)).toBe(98);
    const item = h.handle.sqlite
      .prepare('select cost_price, pricing_factor, cost_total from sale_items')
      .get();
    expect(item).toEqual({ cost_price: 2900, pricing_factor: 1, cost_total: 5800 });
  });

  it('prices bulk items per kg from grams and larger units per factor', async () => {
    const res = await sell(
      sale({
        lines: [line(gula, 'kg', 1500), line(indomie, 'dus', 40), line(rokok, 'batang', 3)],
        cash: 200000,
        // 1500 g x 17.500/kg = 26.250; 1 dus = 130.000; 3 batang x 2.200 = 6.600.
        expectedTotal: 162850,
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().sale.items.map((i: { subtotal: number }) => i.subtotal)).toEqual([
      26250, 130000, 6600,
    ]);
    expect(await stockOf(gula)).toBe(8500);
    expect(await stockOf(indomie)).toBe(60);
    expect(await stockOf(rokok)).toBe(29);
  });

  it.each([
    ['none', 26250, 0],
    ['100', 26300, 50],
    ['500', 26500, 250],
  ])('rounds the total with rounding %s (ties up)', async (mode, total, rounding) => {
    writeSetting(h.handle.db, 'rounding', mode);
    const res = await sell(
      sale({ lines: [line(gula, 'kg', 1500)], cash: 30000, expectedTotal: total }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().sale).toMatchObject({
      subtotal: 26250,
      roundingAmount: rounding,
      total,
      changeAmount: 30000 - total,
    });
  });

  it('stores a negative rounding amount when rounding down', async () => {
    writeSetting(h.handle.db, 'rounding', '500');
    // 1200 g x 17.500/kg = 21.000; 1 batang = 2.200; 23.200 rounds down to 23.000.
    const res = await sell(
      sale({
        lines: [line(gula, 'kg', 1200), line(rokok, 'batang', 1)],
        cash: 23000,
        expectedTotal: 23000,
      }),
    );
    expect(res.json().sale).toMatchObject({ subtotal: 23200, roundingAmount: -200, total: 23000 });
  });

  it('accepts QRIS and cash together; change comes from cash only', async () => {
    const res = await sell(sale({ cash: 5000, qris: 5000 }));
    expect(res.json().sale).toMatchObject({
      paidTotal: 10000,
      changeAmount: 3000,
      payments: [
        { method: 'cash', amount: 5000 },
        { method: 'qris', amount: 5000 },
      ],
    });
  });

  it('accepts QRIS for the exact total', async () => {
    const res = await sell(sale({ cash: 0, qris: 7000 }));
    expect(res.json().sale).toMatchObject({ changeAmount: 0, payments: [{ method: 'qris' }] });
  });

  it('rejects QRIS above the total and underpayment, saving nothing', async () => {
    const qris = await sell(sale({ cash: 0, qris: 7001 }));
    expect(qris.json().error.code).toBe('QRIS_EXCEEDS_TOTAL');
    const under = await sell(sale({ cash: 6999 }));
    expect(under.statusCode).toBe(400);
    expect(under.json().error.code).toBe('UNDERPAID');
    expect(count('sales')).toBe(0);
  });

  it('accepts a bank transfer, alone and beside cash and QRIS', async () => {
    const alone = await sell(sale({ cash: 0, qris: 0, transfer: 7000 }));
    expect(alone.json().sale).toMatchObject({
      changeAmount: 0,
      payments: [{ method: 'transfer', amount: 7000 }],
    });
    const mixed = await sell(sale({ cash: 5000, qris: 2000, transfer: 3000 }));
    expect(mixed.json().sale).toMatchObject({
      paidTotal: 10000,
      // Change comes from the cash only.
      changeAmount: 3000,
      payments: [
        { method: 'cash', amount: 5000 },
        { method: 'qris', amount: 2000 },
        { method: 'transfer', amount: 3000 },
      ],
    });
  });

  it('rejects a transfer above the total, and QRIS plus transfer above it', async () => {
    const transfer = await sell(sale({ cash: 0, qris: 0, transfer: 7001 }));
    expect(transfer.statusCode).toBe(400);
    expect(transfer.json().error.code).toBe('TRANSFER_EXCEEDS_TOTAL');
    // Together above the total: no change may come out of non-cash money.
    const both = await sell(sale({ cash: 0, qris: 4000, transfer: 4000 }));
    expect(both.statusCode).toBe(400);
    expect(count('sales')).toBe(0);
  });

  it('refuses non-cash payments above the total at the service level', () => {
    // The request schema already rejects this shape, so the rule is checked on the service.
    const owner = { id: userIdOf(h, 'pemilik'), role: 'owner' as const };
    expect(() =>
      createSale(serviceContext(h), owner, {
        id: crypto.randomUUID(),
        lines: [line(indomie, 'pcs', 2)],
        cash: 0,
        qris: 4000,
        transfer: 4000,
        expectedTotal: 7000,
      }),
    ).toThrow(expect.objectContaining({ code: 'NON_CASH_EXCEEDS_TOTAL' }));
    expect(count('sales')).toBe(0);
  });

  it('recomputes the total and refuses when the cashier saw a different one', async () => {
    const res = await sell(sale({ expectedTotal: 6000, cash: 6000 }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({
      code: 'TOTAL_CHANGED',
      message: 'Harga berubah sehingga total menjadi Rp 7.000. Periksa ulang keranjang.',
    });
    expect(count('sales')).toBe(0);
  });

  it('rejects a second request with the same id and keeps one sale', async () => {
    const payload = sale();
    expect((await sell(payload)).statusCode).toBe(201);
    const again = await sell(payload);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('DUPLICATE_SALE');
    expect(count('sales')).toBe(1);
    expect(await stockOf(indomie)).toBe(98);
  });

  it('rejects deactivated products and partial units of normal products', async () => {
    const partial = await sell(sale({ lines: [line(indomie, 'dus', 20)] }));
    expect(partial.json().error.code).toBe('INVALID_QUANTITY');
    await h.app.inject({
      method: 'PATCH',
      url: `/api/products/${indomie.id}/active`,
      headers: withSession(ownerToken),
      payload: { active: false },
    });
    const inactive = await sell(sale());
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json().error.message).toBe(
      'INDOMIE GORENG tidak tersedia lagi. Hapus dari keranjang.',
    );
  });

  it('allows negative stock and returns a warning', async () => {
    const res = await sell(
      sale({ lines: [line(rokok, 'bungkus', 48)], cash: 99000, expectedTotal: 99000 }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().warnings).toEqual([
      { productId: rokok.id, productName: 'SAMPOERNA MILD', stock: -16, baseUnit: 'batang' },
    ]);
    expect(sumMovements(h.handle.db, rokok.id)).toBe(-16);
  });

  it('lets cashiers sell', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const res = await sell(sale(), token);
    expect(res.statusCode).toBe(201);
    expect(res.json().sale.cashierName).toBe('Rina');
  });

  it('leaves no partial rows when a write fails mid-transaction', async () => {
    h.handle.sqlite.exec(
      "create trigger fail_sale_movement before insert on stock_movements when new.type = 'sale' begin select raise(abort, 'boom'); end",
    );
    const res = await sell(sale());
    expect(res.statusCode).toBe(500);
    expect([count('sales'), count('sale_items'), count('sale_payments')]).toEqual([0, 0, 0]);
    expect(await stockOf(indomie)).toBe(100);
  });

  it('completes a sale mixing a positive line and a negative return line', async () => {
    const res = await sell({
      id: crypto.randomUUID(),
      lines: [line(indomie, 'pcs', 2), line(indomie, 'pcs', -1)],
      cash: 3500,
      qris: 0,
      expectedTotal: 3500,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { sale: Sale };
    expect(body.sale.total).toBe(3500);
    expect(body.sale.items).toHaveLength(2);
    expect(body.sale.items[0]?.qtyBase).toBe(2);
    expect(body.sale.items[1]?.qtyBase).toBe(-1);
    expect(await stockOf(indomie)).toBe(99);
    expect(sumMovements(h.handle.db, indomie.id)).toBe(99);
  });
});

describe('sale numbers', () => {
  it('count up per local day and restart at 0001 the next day', async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) numbers.push((await sell(sale())).json().sale.number);
    // 17:30 UTC is already 00:30 on the 23rd in WIB.
    h.clock.now = new Date('2026-10-22T17:30:00.000Z');
    numbers.push((await sell(sale())).json().sale.number);
    expect(numbers).toEqual([
      'TRX-20261022-0001',
      'TRX-20261022-0002',
      'TRX-20261022-0003',
      'TRX-20261023-0001',
    ]);
  });

  it('grow past 9999 to five digits', async () => {
    const first = (await sell(sale())).json().sale;
    h.handle.sqlite
      .prepare('update sales set number = ? where id = ?')
      .run('TRX-20261022-9999', first.id);
    expect((await sell(sale())).json().sale.number).toBe('TRX-20261022-10000');
    expect((await sell(sale())).json().sale.number).toBe('TRX-20261022-10001');
  });
});

describe('GET /api/sales', () => {
  const list = async (query = '') =>
    (
      await h.app.inject({
        method: 'GET',
        url: `/api/sales${query}`,
        headers: withSession(ownerToken),
      })
    ).json() as { sales: Sale[]; total: number };

  beforeEach(async () => {
    // Yesterday (local), today x2 (one with gula), and a held sale that never shows here.
    h.clock.now = new Date('2026-10-21T05:00:00.000Z');
    await sell(sale());
    h.clock.now = new Date('2026-10-22T03:00:00.000Z');
    await sell(sale());
    h.clock.now = new Date('2026-10-22T04:00:00.000Z');
    await sell(sale({ lines: [line(gula, 'kg', 1000)], cash: 17500, expectedTotal: 17500 }));
    await h.app.inject({
      method: 'POST',
      url: '/api/sales/held',
      headers: withSession(ownerToken),
      payload: { id: crypto.randomUUID(), lines: [line(indomie, 'pcs', 1)] },
    });
  });

  it('defaults to today, newest first, without held sales', async () => {
    const res = await list();
    expect(res.sales.map((s) => s.number)).toEqual(['TRX-20261022-0002', 'TRX-20261022-0001']);
    expect(res.sales[0]).not.toHaveProperty('items');
  });

  it('filters by local date range', async () => {
    expect((await list('?from=2026-10-21&to=2026-10-21')).sales.map((s) => s.number)).toEqual([
      'TRX-20261021-0001',
    ]);
    expect((await list('?from=2026-10-21&to=2026-10-22')).total).toBe(3);
  });

  it('searches by sale number and by product name or code', async () => {
    expect((await list('?q=0002')).sales.map((s) => s.number)).toEqual(['TRX-20261022-0002']);
    expect((await list('?q=gula')).sales.map((s) => s.number)).toEqual(['TRX-20261022-0002']);
    expect((await list('?q=IDM')).total).toBe(1);
  });

  it('filters by status', async () => {
    expect((await list('?status=completed')).total).toBe(2);
    expect((await list('?status=voided')).total).toBe(0);
  });

  it('returns one sale with items and payments', async () => {
    const [first] = (await list()).sales;
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/sales/${first?.id}`,
      headers: withSession(ownerToken),
    });
    expect(res.json().sale).toMatchObject({ items: [{ productCode: 'GULA', qtyBase: 1000 }] });
  });
});

describe('Done when: 50 sales', () => {
  it('completes 50 mixed sales; stock matches movements; numbers are consecutive', async () => {
    writeSetting(h.handle.db, 'rounding', '100');
    const sold = { indomie: 0, gula: 0, rokok: 0 };
    const numbers: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const lines = [line(indomie, 'pcs', (i % 3) + 1)];
      sold.indomie += (i % 3) + 1;
      if (i % 2 === 0) {
        lines.push(line(gula, 'kg', 250 + i * 10));
        sold.gula += 250 + i * 10;
      }
      if (i % 5 === 0) {
        lines.push(line(rokok, 'batang', 2));
        sold.rokok += 2;
      }
      // The client computes the total with the same shared math before paying.
      const subtotals = lines.map((l) => {
        const p = [indomie, gula, rokok].find((x) => x.id === l.productId);
        const u = p?.units.find((x) => x.id === l.unitId);
        return lineSubtotal({
          qtyBase: l.qtyBase,
          unitPrice: u?.sellPrice ?? 0,
          unitFactor: u?.factor ?? 1,
        });
      });
      const { total } = roundSaleTotal(
        subtotals.reduce((a, b) => a + b, 0),
        '100',
      );
      const res = await sell(
        sale({
          lines,
          cash: i % 4 === 0 ? 0 : total + 500,
          qris: i % 4 === 0 ? total : 0,
          expectedTotal: total,
        }),
      );
      expect(res.statusCode).toBe(201);
      numbers.push(res.json().sale.number);
    }
    expect(numbers).toEqual(
      Array.from({ length: 50 }, (_, i) => `TRX-20261022-${String(i + 1).padStart(4, '0')}`),
    );
    expect(await stockOf(indomie)).toBe(100 - sold.indomie);
    expect(await stockOf(gula)).toBe(10000 - sold.gula);
    expect(await stockOf(rokok)).toBe(32 - sold.rokok);
    for (const p of [indomie, gula, rokok]) {
      expect(await stockOf(p)).toBe(sumMovements(h.handle.db, p.id));
    }
    // Every stored total equals its items plus rounding.
    const mismatches = h.handle.sqlite
      .prepare(
        `select s.number from sales s
         where s.total != (select sum(subtotal) from sale_items i where i.sale_id = s.id) + s.rounding_amount`,
      )
      .all();
    expect(mismatches).toEqual([]);
  });
});
