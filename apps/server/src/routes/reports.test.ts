import {
  type Customer,
  localDate,
  type Product,
  type Purchase,
  type Sale,
  type Supplier,
} from '@toko-podomoro/shared';
import ExcelJS from 'exceljs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeCashier,
  createHarness,
  createProductAs,
  type Harness,
  login,
  OWNER,
  setupOwner,
  withSession,
} from '../testing/harness';

// Seeded dataset (WIB, UTC+7) used by every report below; expected values are computed by hand.
//
// 20 Oct: S1 10 Indomie cash 35.000 | S2 2 rokok cash 70.000 (change 4.000) | S3 500 g gula QRIS
//         8.500 | S4 1 rokok, cash 10.000 + kasbon 23.000 (Bu Ani) | S5 5 Indomie cash 20.000
//         (change 2.500), voided on 21 Oct | Bu Ani pays 5.000 QRIS (voided 21 Oct) | purchase
//         24 Indomie for 57.600, 20.000 paid in cash (that payment voided 21 Oct) | -2 Indomie rusak
// 21 Oct: void S5 | void Bu Ani's 5.000 | Bu Ani pays 13.000 cash | 30.000 QRIS to the supplier |
//         void the 20.000 initial payment | S6 1 rokok QRIS 33.000 | -100 g gula hilang
// 22 Oct: S7 3 Indomie QRIS 10.500 | S8 2 kopi cash 4.000 (kopi goes to -2)

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
let kopi: Product;
let ani: Customer;
let supplier: Supplier;
let s5: Sale;

const api = (
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
  token = ownerToken,
  approval?: string,
) =>
  h.app.inject({
    method,
    url,
    headers: { ...withSession(token), ...(approval ? { 'x-approval-token': approval } : {}) },
    ...(payload ? { payload } : {}),
  });

/** Moves the clock and logs in again (sessions end after 12 h idle). */
const at = async (iso: string) => {
  h.clock.now = new Date(iso);
  if (ownerToken) ownerToken = await login(h, OWNER.username, OWNER.pin);
};

async function sell(
  product: Product,
  qtyBase: number,
  cash: number,
  qris: number,
  customer?: Customer,
) {
  const unit = product.units[0];
  const total = Math.round((qtyBase * (unit?.sellPrice ?? 0)) / (unit?.factor ?? 1));
  const res = await api('POST', '/api/sales', {
    id: crypto.randomUUID(),
    lines: [{ productId: product.id, unitId: unit?.id, qtyBase }],
    cash,
    qris,
    expectedTotal: total,
    ...(customer ? { customerId: customer.id } : {}),
  });
  if (res.statusCode !== 201) throw new Error(`sale failed: ${res.statusCode} ${res.body}`);
  return res.json().sale as Sale;
}

async function payKasbon(amount: number, method: 'cash' | 'qris') {
  const receivables = (await api('GET', `/api/receivables?customerId=${ani.id}`)).json()
    .receivables;
  const res = await api('POST', '/api/customer-payments', {
    id: crypto.randomUUID(),
    customerId: ani.id,
    receivableIds: receivables.map((r: { id: string }) => r.id),
    method,
    amount,
  });
  if (res.statusCode !== 201) throw new Error(`payment failed: ${res.statusCode} ${res.body}`);
  return res.json().payment as { id: string };
}

async function adjust(product: Product, qtyChange: number, reason: string) {
  const res = await api('POST', '/api/stock-adjustments', {
    productId: product.id,
    qtyChange,
    reason,
  });
  if (res.statusCode !== 201) throw new Error(`adjust failed: ${res.statusCode} ${res.body}`);
}

const voidBody = { reason: 'salah_input' };

beforeEach(async () => {
  h = await createHarness();
  ownerToken = '';
  await at('2026-10-19T03:00:00.000Z');
  ({ token: ownerToken } = await setupOwner(h));
  const product = (
    code: string,
    name: string,
    category: string,
    cost: number,
    sell: number,
    stock: number,
  ) =>
    createProductAs(h, ownerToken, {
      code,
      name,
      category,
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: cost,
      units: [{ name: 'pcs', factor: 1, sellPrice: sell, isBase: true }],
      initialStock: stock,
    });
  indomie = await product('IDM', 'Indomie Goreng', 'Sembako', 2500, 3500, 100);
  rokok = await product('SMP', 'Sampoerna Mild', 'Rokok', 30000, 33000, 20);
  await product('SBN', 'Sabun Mandi', 'Lain-lain', 4000, 5000, 5);
  kopi = await product('KP', 'Kopi Sachet', 'Lain-lain', 1500, 2000, 0);
  gula = await createProductAs(h, ownerToken, {
    code: 'GL',
    name: 'Gula Pasir',
    category: 'Sembako',
    type: 'bulk',
    baseUnit: 'gram',
    costPrice: 14000,
    units: [{ name: 'kg', factor: 1000, sellPrice: 17000, isBase: true }],
    initialStock: 10000,
  });
  ani = (await api('POST', '/api/customers', { name: 'Bu Ani' })).json().customer;
  supplier = (await api('POST', '/api/suppliers', { name: 'CV Grosir' })).json().supplier;

  // 20 Oct (10:00 WIB onwards).
  await at('2026-10-20T03:00:00.000Z');
  await sell(indomie, 10, 35000, 0);
  await sell(rokok, 2, 70000, 0);
  await sell(gula, 500, 0, 8500);
  await sell(rokok, 1, 10000, 0, ani);
  s5 = await sell(indomie, 5, 20000, 0);
  const qrisKasbon = await payKasbon(5000, 'qris');
  const purchase = (
    await api('POST', '/api/purchases', {
      id: crypto.randomUUID(),
      supplierId: supplier.id,
      lines: [
        {
          productId: indomie.id,
          unitId: indomie.units[0]?.id,
          qtyBase: 24,
          buyPrice: 2400,
          newCostPrice: 2500,
        },
      ],
      paidAmount: 20000,
    })
  ).json().purchase as Purchase;
  await adjust(indomie, -2, 'rusak');

  // 21 Oct.
  await at('2026-10-21T02:00:00.000Z');
  expect((await api('POST', `/api/sales/${s5.id}/void`, voidBody)).statusCode).toBe(200);
  expect(
    (await api('POST', `/api/customer-payments/${qrisKasbon.id}/void`, voidBody)).statusCode,
  ).toBe(200);
  await payKasbon(13000, 'cash');
  const debtPayment = await api('POST', '/api/supplier-payments', {
    id: crypto.randomUUID(),
    supplierId: supplier.id,
    purchaseIds: [purchase.id],
    method: 'qris',
    amount: 30000,
  });
  expect(debtPayment.statusCode).toBe(201);
  const initial = purchase.payments[0]?.paymentId;
  expect((await api('POST', `/api/supplier-payments/${initial}/void`, voidBody)).statusCode).toBe(
    200,
  );
  await sell(rokok, 1, 0, 33000);
  await adjust(gula, -100, 'hilang');

  // 22 Oct.
  await at('2026-10-22T04:00:00.000Z');
  await sell(indomie, 3, 0, 10500);
  await sell(kopi, 2, 4000, 0);
});

afterEach(async () => {
  await h.close();
});

const report = async (path: string) => {
  const res = await api('GET', `/api/reports/${path}`);
  if (res.statusCode !== 200) throw new Error(`report failed: ${res.statusCode} ${res.body}`);
  return res.json();
};

const categoryId = async (name: string) =>
  (await api('GET', '/api/categories'))
    .json()
    .categories.find((c: { name: string }) => c.name === name).id as string;

const PERIOD = 'from=2026-10-20&to=2026-10-21';

describe('Done when: totals match raw data on a seeded dataset', () => {
  it('sales & profit: voided sales leave their original date', async () => {
    const r = await report(`summary?${PERIOD}`);
    expect(r.totals).toEqual({
      transactions: 5,
      itemsSubtotal: 175500,
      roundingAmount: 0,
      revenue: 175500,
      cost: 152000,
      profit: 23500,
      marginBp: 1339,
      kasbon: 23000,
    });
    expect(r.days).toEqual([
      { day: '2026-10-20', transactions: 4, revenue: 142500, cost: 122000, profit: 20500 },
      { day: '2026-10-21', transactions: 1, revenue: 33000, cost: 30000, profit: 3000 },
    ]);
    expect(r.voided).toEqual({ count: 1, total: 17500 });
    // S5 was voided on the 21st but disappears from the 20th.
    expect((await report('summary?from=2026-10-20')).totals.transactions).toBe(4);

    // Raw data: completed sales and their items.
    const raw = h.handle.sqlite
      .prepare(
        `select count(*) as n, sum(total) as revenue,
           (select sum(i.cost_total) from sale_items i join sales s on s.id = i.sale_id
            where s.status = 'completed' and s.completed_at >= ? and s.completed_at < ?) as cost
         from sales where status = 'completed' and completed_at >= ? and completed_at < ?`,
      )
      .get(
        '2026-10-19T17:00:00.000Z',
        '2026-10-21T17:00:00.000Z',
        '2026-10-19T17:00:00.000Z',
        '2026-10-21T17:00:00.000Z',
      ) as { n: number; revenue: number; cost: number };
    expect([r.totals.transactions, r.totals.revenue, r.totals.cost]).toEqual([
      raw.n,
      raw.revenue,
      raw.cost,
    ]);
  });

  it('per category: revenue, profit, margin, and share; filter keeps the share of all', async () => {
    const r = await report(`categories?${PERIOD}`);
    expect(r.rows.map((c: { categoryName: string }) => c.categoryName)).toEqual([
      'Rokok',
      'Sembako',
    ]);
    expect(r.rows[0]).toMatchObject({
      revenue: 132000,
      cost: 120000,
      profit: 12000,
      marginBp: 909,
      shareBp: 7521,
    });
    expect(r.rows[1]).toMatchObject({
      revenue: 43500,
      cost: 32000,
      profit: 11500,
      marginBp: 2644,
      shareBp: 2479,
    });
    expect(r.totals).toEqual({ revenue: 175500, cost: 152000, profit: 23500, marginBp: 1339 });
    const rokokOnly = await report(`categories?${PERIOD}&categoryId=${await categoryId('Rokok')}`);
    expect(rokokOnly.rows).toHaveLength(1);
    expect(rokokOnly.rows[0].shareBp).toBe(7521);
  });

  it('top and slow products', async () => {
    const r = await report(`products?${PERIOD}`);
    expect(
      r.top.map((p: { productCode: string; qtyBase: number; revenue: number }) => [
        p.productCode,
        p.qtyBase,
        p.revenue,
      ]),
    ).toEqual([
      ['SMP', 4, 132000],
      ['IDM', 10, 35000],
      ['GL', 500, 8500],
    ]);
    expect(r.soldProducts).toBe(3);
    expect(r.slow.map((p: { productCode: string }) => p.productCode)).toEqual([
      'KP',
      'SBN',
      'SMP',
      'IDM',
      'GL',
    ]);
    const sembako = await report(`products?${PERIOD}&categoryId=${await categoryId('Sembako')}`);
    expect(sembako.slow.map((p: { productCode: string }) => p.productCode)).toEqual(['IDM', 'GL']);
  });

  it('stock value counts negative stock as 0 and lists it separately', async () => {
    const r = await report('stock-value');
    expect(
      r.rows.map((p: { productCode: string; stock: number; value: number }) => [
        p.productCode,
        p.stock,
        p.value,
      ]),
    ).toEqual([
      ['SMP', 16, 480000],
      ['IDM', 109, 272500],
      ['GL', 9400, 131600],
      ['SBN', 5, 20000],
    ]);
    expect(r.totals).toEqual({ value: 904100, items: 4 });
    expect(r.negatives).toEqual([
      expect.objectContaining({ productCode: 'KP', stock: -2, value: 0 }),
    ]);
    // Raw data: cached stock equals movements.
    const bad = h.handle.sqlite
      .prepare(
        'select code from products p where stock != (select coalesce(sum(qty_change), 0) from stock_movements m where m.product_id = p.id)',
      )
      .all();
    expect(bad).toEqual([]);
    const lain = await report(`stock-value?categoryId=${await categoryId('Lain-lain')}`);
    expect(lain.totals.value).toBe(20000);
  });

  it('cash: money counts on the day it moved; voids are refunds on the void day', async () => {
    const r = await report(`cash?${PERIOD}`);
    expect(r.days).toEqual([
      {
        day: '2026-10-20',
        salesCash: 128500,
        salesQris: 8500,
        kasbonCash: 0,
        kasbonQris: 5000,
        supplierCash: 20000,
        supplierQris: 0,
        voidCash: 0,
        voidQris: 0,
        netCash: 108500,
        netQris: 13500,
      },
      {
        day: '2026-10-21',
        salesCash: 0,
        salesQris: 33000,
        kasbonCash: 13000,
        kasbonQris: 0,
        supplierCash: 0,
        supplierQris: 30000,
        voidCash: 2500,
        voidQris: -5000,
        netCash: 15500,
        netQris: -2000,
      },
    ]);
    // Over the whole period voids cancel out: net equals valid records only.
    const raw = h.handle.sqlite
      .prepare(
        `select
          (select coalesce(sum(p.amount), 0) from sale_payments p join sales s on s.id = p.sale_id
            where s.status = 'completed' and p.method = 'cash' and s.completed_at < ?)
          - (select coalesce(sum(change_amount), 0) from sales where status = 'completed' and completed_at < ?)
          + (select coalesce(sum(amount), 0) from customer_payments where status = 'active' and method = 'cash')
          - (select coalesce(sum(amount), 0) from supplier_payments where status = 'active' and method = 'cash')
          as net_cash`,
      )
      .get('2026-10-21T17:00:00.000Z', '2026-10-21T17:00:00.000Z') as { net_cash: number };
    expect(r.totals.netCash).toBe(raw.net_cash);
    expect(r.totals).toMatchObject({
      netCash: 124000,
      netQris: 11500,
      salesCash: 128500,
      salesQris: 41500,
    });
  });

  it('receivables and payables as of now', async () => {
    const r = await report('debts');
    expect(r.receivables).toEqual({
      total: 10000,
      customers: [expect.objectContaining({ name: 'Bu Ani', balance: 10000, openCount: 1 })],
    });
    expect(r.payables).toEqual({
      total: 27600,
      suppliers: [expect.objectContaining({ name: 'CV Grosir', balance: 27600, openCount: 1 })],
    });
  });

  it('stock losses valued at the recorded cost, with category filter', async () => {
    const r = await report(`losses?${PERIOD}`);
    expect(r.totals).toEqual({ count: 2, value: 6400 });
    expect(r.byReason).toEqual([
      { reason: 'rusak', count: 1, value: 5000 },
      { reason: 'hilang', count: 1, value: 1400 },
    ]);
    expect(
      r.rows.map((l: { productCode: string; qtyBase: number }) => [l.productCode, l.qtyBase]),
    ).toEqual([
      ['GL', 100],
      ['IDM', 2],
    ]);
    const rokokOnly = await report(`losses?${PERIOD}&categoryId=${await categoryId('Rokok')}`);
    expect(rokokOnly.totals).toEqual({ count: 0, value: 0 });
  });

  it('activity shows voids on the void date', async () => {
    const r = await report('activity?from=2026-10-21');
    const descriptions = r.rows.map((a: { description: string }) => a.description);
    expect(descriptions).toEqual(
      expect.arrayContaining([
        `Batal transaksi ${s5.number}: Salah input`,
        expect.stringMatching(/^Batal pembayaran kasbon BYR-20261020-0001: Salah input$/),
        expect.stringMatching(/^Batal pembayaran hutang BYH-20261020-0001: Salah input$/),
      ]),
    );
    const day20 = await report('activity?from=2026-10-20');
    expect(day20.rows.some((a: { action: string }) => a.action === 'void')).toBe(false);
  });
});

describe('category snapshot', () => {
  it('keeps past reports when a product changes category or a category is renamed', async () => {
    const before = {
      categories: await report(`categories?${PERIOD}`),
      products: await report(`products?${PERIOD}`),
      sembako: await report(`products?${PERIOD}&categoryId=${await categoryId('Sembako')}`),
    };
    const lainLain = await categoryId('Lain-lain');
    const update = await h.app.inject({
      method: 'PUT',
      url: `/api/products/${indomie.id}`,
      headers: withSession(ownerToken),
      payload: {
        code: 'IDM',
        name: 'Indomie Goreng',
        categoryId: lainLain,
        type: 'unit',
        baseUnit: 'pcs',
        costPrice: 2500,
        units: [
          { id: indomie.units[0]?.id, name: 'pcs', factor: 1, sellPrice: 3500, isBase: true },
        ],
      },
    });
    expect(update.statusCode).toBe(200);
    const rename = await h.app.inject({
      method: 'PUT',
      url: `/api/categories/${await categoryId('Rokok')}`,
      headers: withSession(ownerToken),
      payload: { name: 'Rokok & Tembakau' },
    });
    expect(rename.statusCode).toBe(200);

    expect(await report(`categories?${PERIOD}`)).toEqual(before.categories);
    expect(await report(`products?${PERIOD}`)).toEqual({
      ...before.products,
      // Slow movers are the catalog as it is now.
      slow: expect.any(Array),
    });
    const sembako = await report(`products?${PERIOD}&categoryId=${await categoryId('Sembako')}`);
    expect(sembako.top).toEqual(before.sembako.top);

    // A new sale counts under the product's new category.
    await sell(indomie, 2, 7000, 0);
    const today = await report('categories');
    expect(
      today.rows.map((c: { categoryName: string; revenue: number }) => [c.categoryName, c.revenue]),
    ).toEqual(
      [
        ['Sembako', 10500],
        ['Lain-lain', 11000],
      ].sort((a, b) => Number(b[1]) - Number(a[1])),
    );
  });
});

describe('report access and queries', () => {
  it('needs the owner PIN (laporan menu) for cashiers', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const refused = await api('GET', '/api/reports/summary', undefined, token);
    expect(refused.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    const approval = await api(
      'POST',
      '/api/auth/approve',
      { pin: OWNER.pin, scope: 'laporan' },
      token,
    );
    const menu = approval.json().token;
    const ok = await api('GET', `/api/reports/summary?${PERIOD}`, undefined, token, menu);
    expect(ok.statusCode).toBe(200);
    // Menu tokens are not spent.
    const again = await api('GET', '/api/reports/debts', undefined, token, menu);
    expect(again.statusCode).toBe(200);
    // The approval and a failed owner PIN show in the activity report (stamped with the
    // wall clock, not the test clock).
    await api('POST', '/api/auth/approve', { pin: '999999', scope: 'laporan' }, token);
    const today = localDate(new Date());
    const activity = await report(`activity?from=${today}&to=${today}`);
    const descriptions = activity.rows.map((a: { description: string }) => a.description);
    expect(descriptions).toContain('Persetujuan pemilik untuk membuka Laporan');
    expect(descriptions).toContain(
      'PIN salah pada persetujuan pemilik (membuka Laporan) untuk Rina',
    );
    const granted = activity.rows.find((a: { action: string }) => a.action === 'grant');
    expect(granted).toMatchObject({ userName: 'Rina', approvedByName: 'Bu Sari' });
  });

  it('refuses a category filter on non-product reports, bad periods, and unknown types', async () => {
    const id = await categoryId('Rokok');
    const code = async (path: string) =>
      (await api('GET', `/api/reports/${path}`)).json().error?.code;
    expect(await code(`cash?categoryId=${id}`)).toBe('VALIDATION_ERROR');
    expect(await code(`summary?categoryId=${id}`)).toBe('VALIDATION_ERROR');
    expect(await code(`debts?categoryId=${id}`)).toBe('VALIDATION_ERROR');
    expect(await code('summary?from=2026-10-21&to=2026-10-20')).toBe('INVALID_PERIOD');
    expect(await code('summary?from=2025-01-01&to=2026-10-20')).toBe('PERIOD_TOO_LONG');
    expect(await code('nope')).toBe('VALIDATION_ERROR');
    expect(await code(`categories?categoryId=${id}`)).toBeUndefined();
  });

  it('defaults to today', async () => {
    const r = await report('summary');
    expect(r).toMatchObject({ from: '2026-10-22', to: '2026-10-22' });
    expect(r.totals.revenue).toBe(14500);
  });
});

describe('report exports', () => {
  it('saves a PDF with the report', async () => {
    const res = await api('GET', `/api/reports/summary/export?format=pdf&${PERIOD}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="Laporan-summary-2026-10-20_2026-10-21.pdf"',
    );
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // A short report fits one page (the page footer must not start a new one).
    expect(res.rawPayload.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('saves every report as PDF and Excel', async () => {
    for (const type of [
      'summary',
      'categories',
      'products',
      'stock-value',
      'cash',
      'debts',
      'losses',
      'activity',
    ]) {
      for (const format of ['pdf', 'xlsx']) {
        const res = await api('GET', `/api/reports/${type}/export?format=${format}`);
        expect(res.statusCode, `${type} ${format}`).toBe(200);
      }
    }
  });

  it('writes numbers into Excel cells', async () => {
    const res = await api('GET', `/api/reports/categories/export?format=xlsx&${PERIOD}`);
    expect(res.headers['content-disposition']).toContain(
      'Laporan-categories-2026-10-20_2026-10-21.xlsx',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Ringkasan', 'Per kategori']);
    const sheet = workbook.getWorksheet('Per kategori');
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      'Kategori',
      'Omzet',
      'Modal',
      'Laba',
      'Margin',
      'Porsi',
    ]);
    expect(sheet?.getRow(2).values).toEqual([
      undefined,
      'Rokok',
      132000,
      120000,
      12000,
      0.0909,
      0.7521,
    ]);
    expect(sheet?.getRow(4).values).toEqual([undefined, 'Total', 175500, 152000, 23500, 0.1339]);
    expect(sheet?.getColumn(2).numFmt).toBe('"Rp "#,##0;-"Rp "#,##0');
  });

  it('refuses an unknown format and a category on a cash export', async () => {
    const bad = await api('GET', '/api/reports/summary/export?format=csv');
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    const id = await categoryId('Rokok');
    const cat = await api('GET', `/api/reports/cash/export?format=pdf&categoryId=${id}`);
    expect(cat.json().error.code).toBe('VALIDATION_ERROR');
  });
});
