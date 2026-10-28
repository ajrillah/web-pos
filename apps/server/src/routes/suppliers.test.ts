import type { Product, Purchase, Supplier } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeCashier,
  auditRows,
  createHarness,
  createProductAs,
  type Harness,
  OWNER,
  setupOwner,
  userIdOf,
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
    units: [
      { name: 'pcs', isi: 1, sellPrice: 3500, isBase: true },
      { name: 'dus', isi: 40, sellPrice: 130000, isBase: false },
    ],
    initialStock: 10,
  });
  gula = await createProductAs(h, ownerToken, {
    code: 'GL',
    name: 'Gula Pasir',
    category: 'Sembako',
    type: 'bulk',
    baseUnit: 'gram',
    costPrice: 14000,
    units: [{ name: 'kg', isi: 1000, sellPrice: 17000, isBase: true }],
  });
});

afterEach(async () => {
  await h.close();
});

type Method = 'GET' | 'POST' | 'PUT';

const api = (
  method: Method,
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

async function newSupplier(name = 'CV Sumber Rejeki', token = ownerToken): Promise<Supplier> {
  const res = await api('POST', '/api/suppliers', { name, phone: '0274' }, token);
  if (res.statusCode !== 201) throw new Error(`supplier failed: ${res.statusCode} ${res.body}`);
  return res.json().supplier;
}

const unitOf = (product: Product, name: string) =>
  product.units.find((u) => u.name === name)?.id ?? 'missing';

/** 2 dus Indomie at Rp 100.000 (cost unchanged unless `newCost`), paying `paid`. */
function purchaseBody(supplier: Supplier, paid: number, extra: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    supplierId: supplier.id,
    lines: [
      {
        productId: indomie.id,
        unitId: unitOf(indomie, 'dus'),
        qtyBase: 80,
        buyPrice: 100000,
        newCostPrice: 2500,
      },
    ],
    paidAmount: paid,
    ...extra,
  };
}

async function buy(supplier: Supplier, paid: number, extra: Record<string, unknown> = {}) {
  const res = await api('POST', '/api/purchases', purchaseBody(supplier, paid, extra));
  if (res.statusCode !== 201) throw new Error(`purchase failed: ${res.statusCode} ${res.body}`);
  return res.json().purchase as Purchase;
}

async function paySupplier(supplier: Supplier, purchaseIds: string[], amount: number) {
  return api('POST', '/api/supplier-payments', {
    id: crypto.randomUUID(),
    supplierId: supplier.id,
    purchaseIds,
    method: 'cash',
    amount,
  });
}

const stockOf = async (product: Product) =>
  (await api('GET', `/api/products/${product.id}`)).json().product.stock as number;

const getPurchase = async (id: string) =>
  (await api('GET', `/api/purchases/${id}`)).json().purchase as Purchase;

/** Stock cache equals movements; purchase remaining equals total minus active allocations. */
function reconcile() {
  const db = h.handle.sqlite;
  const stock = db
    .prepare(
      `select p.code, p.stock, coalesce((select sum(m.qty_change) from stock_movements m
        where m.product_id = p.id), 0) as moved from products p`,
    )
    .all() as { code: string; stock: number; moved: number }[];
  for (const row of stock) expect(row.stock, row.code).toBe(row.moved);
  const debts = db
    .prepare(
      `select pu.number, pu.total, pu.paid_amount, pu.remaining,
        coalesce((select sum(a.amount) from supplier_allocations a
          join supplier_payments sp on sp.id = a.payment_id
          where a.purchase_id = pu.id and sp.status = 'active'), 0) as allocated
       from purchases pu`,
    )
    .all() as {
    number: string;
    total: number;
    paid_amount: number;
    remaining: number;
    allocated: number;
  }[];
  for (const row of debts) {
    expect(row.remaining, row.number).toBe(row.total - row.allocated);
    expect(row.paid_amount, row.number).toBe(row.allocated);
  }
  const payments = db
    .prepare(
      `select sp.number, sp.amount, (select sum(a.amount) from supplier_allocations a
        where a.payment_id = sp.id) as allocated from supplier_payments sp`,
    )
    .all() as { number: string; amount: number; allocated: number }[];
  for (const row of payments) expect(row.amount, row.number).toBe(row.allocated);
}

describe('suppliers', () => {
  it('lets cashiers add and edit suppliers; every change is audit-logged', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const supplier = await newSupplier('Toko Grosir Jaya', token);
    expect(supplier).toMatchObject({ name: 'TOKO GROSIR JAYA', phone: '0274', balance: 0 });
    const res = await api('PUT', `/api/suppliers/${supplier.id}`, { note: 'SALES PAK ARI' }, token);
    expect(res.json().supplier.note).toBe('SALES PAK ARI');
    const list = await api('GET', '/api/suppliers?q=grosir');
    expect(list.json().suppliers.map((s: Supplier) => s.name)).toEqual(['TOKO GROSIR JAYA']);
    expect(auditRows(h, 'supplier').map((r) => r.action)).toEqual(['create', 'update']);
  });

  it('refuses to deactivate a supplier with debt', async () => {
    const supplier = await newSupplier();
    await buy(supplier, 50000);
    const res = await api('PUT', `/api/suppliers/${supplier.id}`, { active: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SUPPLIER_HAS_DEBT');
    expect(res.json().error.message).toContain('Rp 150.000');
  });
});

describe('purchases (Stok Masuk)', () => {
  it('adds stock through movements and records the initial payment', async () => {
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 50000, { note: 'FAKTUR 123' });
    expect(purchase).toMatchObject({
      number: 'BLI-20261022-0001',
      date: '2026-10-22',
      total: 200000,
      paidAmount: 50000,
      remaining: 150000,
      status: 'completed',
      note: 'FAKTUR 123',
      supplierName: 'CV SUMBER REJEKI',
    });
    expect(purchase.items[0]).toMatchObject({
      productCode: 'IDM',
      unitName: 'dus',
      qtyBase: 80,
      unitFactor: 40,
      buyPrice: 100000,
      subtotal: 200000,
    });
    expect(purchase.payments).toEqual([
      expect.objectContaining({
        number: 'BYH-20261022-0001',
        amount: 50000,
        initial: true,
        status: 'active',
      }),
    ]);
    expect(await stockOf(indomie)).toBe(90);
    expect((await api('GET', `/api/suppliers/${supplier.id}`)).json().supplier.balance).toBe(
      150000,
    );
    // Purchases are not audit-logged.
    expect(auditRows(h, 'purchase')).toEqual([]);
    reconcile();
  });

  it('prices bulk lines per kg and rounds each subtotal half up', async () => {
    const supplier = await newSupplier();
    const res = await api('POST', '/api/purchases', {
      id: crypto.randomUUID(),
      supplierId: supplier.id,
      lines: [
        {
          productId: gula.id,
          unitId: unitOf(gula, 'kg'),
          qtyBase: 2250,
          buyPrice: 13333,
          newCostPrice: 13333,
        },
      ],
      paidAmount: 29999,
      paidMethod: 'qris',
    });
    expect(res.statusCode).toBe(201);
    // 2250 * 13333 / 1000 = 29999.25
    expect(res.json().purchase).toMatchObject({ total: 29999, remaining: 0, paidAmount: 29999 });
    expect(res.json().purchase.payments[0].method).toBe('qris');
    expect(await stockOf(gula)).toBe(2250);
    reconcile();
  });

  it('updates cost prices and audit-logs the change with the purchase', async () => {
    const supplier = await newSupplier();
    const body = purchaseBody(supplier, 0);
    body.lines[0] = { ...(body.lines[0] as (typeof body.lines)[0]), newCostPrice: 2600 };
    const res = await api('POST', '/api/purchases', body);
    expect(res.statusCode).toBe(201);
    expect(res.json().purchase.items[0]).toMatchObject({ oldCostPrice: 2500, newCostPrice: 2600 });
    expect((await api('GET', `/api/products/${indomie.id}`)).json().product.costPrice).toBe(2600);
    expect(auditRows(h, 'product').at(-1)).toMatchObject({
      entityId: indomie.id,
      action: 'cost_from_purchase',
      oldValue: { costPrice: 2500 },
      newValue: { costPrice: 2600, purchaseId: body.id },
    });
  });

  it('needs owner approval when a cashier changes a cost price', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const supplier = await newSupplier();
    // Unchanged cost: open to cashiers.
    const plain = await api('POST', '/api/purchases', purchaseBody(supplier, 0), token);
    expect(plain.statusCode).toBe(201);

    const body = purchaseBody(supplier, 0);
    body.lines[0] = { ...(body.lines[0] as (typeof body.lines)[0]), newCostPrice: 2700 };
    const refused = await api('POST', '/api/purchases', body, token);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    expect(await stockOf(indomie)).toBe(90);

    const approval = await api(
      'POST',
      '/api/auth/approve',
      { pin: OWNER.pin, scope: 'purchase.cost', targetId: body.id },
      token,
    );
    const ok = await api('POST', '/api/purchases', body, token, approval.json().token);
    expect(ok.statusCode).toBe(201);
    const row = h.handle.sqlite
      .prepare(
        "select approved_by from audit_logs where entity = 'product' and action = 'cost_from_purchase'",
      )
      .get() as { approved_by: string };
    expect(row.approved_by).toBe(userIdOf(h, 'pemilik'));
  });

  it('validates purchases and rejects duplicates', async () => {
    const supplier = await newSupplier();
    const body = purchaseBody(supplier, 0);
    expect((await api('POST', '/api/purchases', body)).statusCode).toBe(201);
    const dup = await api('POST', '/api/purchases', body);
    expect([dup.statusCode, dup.json().error.code]).toEqual([409, 'DUPLICATE_PURCHASE']);

    const code = async (extra: Record<string, unknown>, lines?: object[]) => {
      const res = await api('POST', '/api/purchases', {
        ...purchaseBody(supplier, 0, extra),
        ...(lines ? { lines } : {}),
      });
      return res.json().error?.code;
    };
    expect(await code({ paidAmount: 200001 })).toBe('PAID_EXCEEDS_TOTAL');
    expect(await code({ date: '2026-10-23' })).toBe('DATE_IN_FUTURE');
    const line = purchaseBody(supplier, 0).lines[0] as object;
    expect(await code({}, [line, line])).toBe('DUPLICATE_LINE');
    expect(await code({}, [{ ...line, qtyBase: 81 }])).toBe('INVALID_QUANTITY');
    expect(await code({}, [{ ...line, qtyBase: 1.5 }])).toBe('VALIDATION_ERROR');

    const other = await newSupplier('Lain');
    await api('PUT', `/api/suppliers/${other.id}`, { active: false });
    const inactive = await api('POST', '/api/purchases', purchaseBody(other, 0));
    expect(inactive.json().error.code).toBe('SUPPLIER_INACTIVE');
    reconcile();
  });

  it('accepts a past purchase date and lists purchases newest first', async () => {
    const supplier = await newSupplier();
    const first = await buy(supplier, 0, { date: '2026-10-20' });
    h.clock.advance(60_000);
    const second = await buy(supplier, 0);
    expect(first.date).toBe('2026-10-20');
    const list = (await api('GET', '/api/purchases')).json();
    expect(list.purchases.map((p: Purchase) => p.number)).toEqual([second.number, first.number]);
    expect(list.total).toBe(2);
    const search = (await api('GET', `/api/purchases?q=${second.number}`)).json();
    expect(search.purchases).toHaveLength(1);
  });

  it('suggests the last buy price as a cost per pricing unit', async () => {
    const supplier = await newSupplier();
    const before = (
      await api('GET', `/api/purchases/cost-suggestion?productId=${indomie.id}`)
    ).json();
    expect(before).toMatchObject({ costPrice: 2500, stock: 10, lastBuyCost: null });
    await buy(supplier, 0, { date: '2026-10-21' });
    const after = (
      await api('GET', `/api/purchases/cost-suggestion?productId=${indomie.id}`)
    ).json();
    // Rp 100.000 per dus of 40 -> Rp 2.500 per pcs.
    expect(after).toMatchObject({ lastBuyCost: 2500, lastBuyDate: '2026-10-21', stock: 90 });
  });
});

describe('supplier payments', () => {
  it('fills ticked purchases oldest first and never exceeds the ticked total', async () => {
    const supplier = await newSupplier();
    const old = await buy(supplier, 0);
    h.clock.advance(60_000);
    const recent = await buy(supplier, 150000);

    const payables = (await api('GET', `/api/payables?supplierId=${supplier.id}`)).json();
    expect(payables.purchases.map((p: Purchase) => p.id)).toEqual([old.id, recent.id]);
    expect(payables.totalRemaining).toBe(250000);

    const tooMuch = await paySupplier(supplier, [old.id, recent.id], 250001);
    expect(tooMuch.json().error.code).toBe('AMOUNT_EXCEEDS_DEBT');

    const res = await paySupplier(supplier, [recent.id, old.id], 220000);
    expect(res.statusCode).toBe(201);
    expect(res.json().payment).toMatchObject({
      number: 'BYH-20261022-0002',
      amount: 220000,
      initialPurchaseId: null,
      allocations: [
        { purchaseId: old.id, amount: 200000 },
        { purchaseId: recent.id, amount: 20000 },
      ],
    });
    expect((await getPurchase(old.id)).remaining).toBe(0);
    expect((await getPurchase(recent.id)).remaining).toBe(30000);

    // A paid purchase can no longer be ticked.
    const paidOff = await paySupplier(supplier, [old.id], 1000);
    expect(paidOff.json().error.code).toBe('INVALID_PAYABLES');
    reconcile();
  });

  it('rejects a duplicate payment id', async () => {
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 0);
    const body = {
      id: crypto.randomUUID(),
      supplierId: supplier.id,
      purchaseIds: [purchase.id],
      method: 'cash',
      amount: 1000,
    };
    expect((await api('POST', '/api/supplier-payments', body)).statusCode).toBe(201);
    const dup = await api('POST', '/api/supplier-payments', body);
    expect([dup.statusCode, dup.json().error.code]).toEqual([409, 'DUPLICATE_PAYMENT']);
  });

  it('voids a payment with owner approval and restores the debt', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 0);
    const payment = (await paySupplier(supplier, [purchase.id], 120000)).json().payment;

    const url = `/api/supplier-payments/${payment.id}/void`;
    const refused = await api('POST', url, { reason: 'salah_input' }, token);
    expect(refused.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    const approval = (
      await api(
        'POST',
        '/api/auth/approve',
        { pin: OWNER.pin, scope: 'supplier-payment.void', targetId: payment.id },
        token,
      )
    ).json().token;
    const res = await api('POST', url, { reason: 'salah_input' }, token, approval);
    expect(res.json().payment).toMatchObject({ status: 'voided', voidReason: 'Salah input' });
    expect((await getPurchase(purchase.id)).remaining).toBe(200000);
    // The action token is single-use.
    const again = await api('POST', url, { reason: 'salah_input' }, token, approval);
    expect(again.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    const twice = await api('POST', url, { reason: 'salah_input' });
    expect(twice.json().error.code).toBe('PAYMENT_NOT_VOIDABLE');
    expect(auditRows(h, 'supplier_payment')).toEqual([
      expect.objectContaining({ entityId: payment.id, action: 'void' }),
    ]);
    reconcile();
  });

  it('voids a purchase initial payment on its own; the amount becomes debt again', async () => {
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 200000);
    expect(purchase.remaining).toBe(0);
    const initial = purchase.payments[0];
    const res = await api('POST', `/api/supplier-payments/${initial?.paymentId}/void`, {
      reason: 'lainnya',
      note: 'Belum dibayar',
    });
    expect(res.json().payment.voidReason).toBe('Lainnya: Belum dibayar');
    expect(await getPurchase(purchase.id)).toMatchObject({
      status: 'completed',
      remaining: 200000,
      paidAmount: 0,
    });
    expect((await api('GET', `/api/suppliers/${supplier.id}`)).json().supplier.balance).toBe(
      200000,
    );
    reconcile();
  });
});

describe('purchase void', () => {
  it('reverses stock, voids the initial payment, and keeps cost prices for review', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const supplier = await newSupplier();
    const body = purchaseBody(supplier, 50000);
    body.lines[0] = { ...(body.lines[0] as (typeof body.lines)[0]), newCostPrice: 2600 };
    const purchase = (await api('POST', '/api/purchases', body)).json().purchase as Purchase;
    expect(await stockOf(indomie)).toBe(90);

    const url = `/api/purchases/${purchase.id}/void`;
    expect((await api('POST', url, { reason: 'salah_input' }, token)).statusCode).toBe(403);
    const approval = (
      await api(
        'POST',
        '/api/auth/approve',
        { pin: OWNER.pin, scope: 'purchase.void', targetId: purchase.id },
        token,
      )
    ).json().token;
    const res = await api('POST', url, { reason: 'salah_input' }, token, approval);
    expect(res.statusCode).toBe(200);
    const { purchase: voided, costReview } = res.json();
    expect(voided).toMatchObject({
      status: 'voided',
      voidReason: 'Salah input',
      remaining: 200000,
    });
    expect(voided.payments[0]).toMatchObject({ initial: true, status: 'voided' });
    expect(costReview).toEqual([
      expect.objectContaining({ productId: indomie.id, costPrice: 2600, productCode: 'IDM' }),
    ]);
    expect(await stockOf(indomie)).toBe(10);
    // Cost price is not reverted.
    expect((await api('GET', `/api/products/${indomie.id}`)).json().product.costPrice).toBe(2600);
    const types = h.handle.sqlite
      .prepare('select type, qty_change from stock_movements where ref_id = ? order by rowid')
      .all(purchase.id);
    expect(types).toEqual([
      { type: 'purchase', qty_change: 80 },
      { type: 'purchase_void', qty_change: -80 },
    ]);
    expect(auditRows(h, 'purchase').map((r) => r.action)).toEqual(['void']);
    expect(auditRows(h, 'supplier_payment').map((r) => r.action)).toEqual(['void']);
    expect((await api('GET', `/api/suppliers/${supplier.id}`)).json().supplier.balance).toBe(0);
    const twice = await api('POST', url, { reason: 'salah_input' });
    expect(twice.json().error.code).toBe('PURCHASE_NOT_VOIDABLE');
    reconcile();
  });

  it('is refused while a debt payment is active, allowed after voiding it', async () => {
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 10000);
    const payment = (await paySupplier(supplier, [purchase.id], 5000)).json().payment;
    const url = `/api/purchases/${purchase.id}/void`;
    const refused = await api('POST', url, { reason: 'salah_input' });
    expect([refused.statusCode, refused.json().error.code]).toEqual([409, 'PURCHASE_HAS_PAYMENTS']);
    await api('POST', `/api/supplier-payments/${payment.id}/void`, { reason: 'salah_input' });
    const ok = await api('POST', url, { reason: 'salah_input' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().costReview).toEqual([]);
    reconcile();
  });

  it('requires a note for "lainnya"', async () => {
    const supplier = await newSupplier();
    const purchase = await buy(supplier, 0);
    const res = await api('POST', `/api/purchases/${purchase.id}/void`, { reason: 'lainnya' });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    const wrong = await api('POST', `/api/purchases/${purchase.id}/void`, {
      reason: 'pembeli_batal',
    });
    expect(wrong.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Kartu Hutang', () => {
  it('runs a balance over purchases and payments that matches the supplier debt', async () => {
    const supplier = await newSupplier();
    const first = await buy(supplier, 50000);
    h.clock.advance(60_000);
    const second = await buy(supplier, 0);
    h.clock.advance(60_000);
    const payment = (await paySupplier(supplier, [first.id], 100000)).json().payment;
    h.clock.advance(60_000);
    const voidedPayment = (await paySupplier(supplier, [second.id], 30000)).json().payment;
    await api('POST', `/api/supplier-payments/${voidedPayment.id}/void`, { reason: 'salah_input' });

    const ledger = (await api('GET', `/api/suppliers/${supplier.id}/ledger`)).json();
    expect(
      ledger.entries.map(
        (e: { number: string; change: number; balance: number; voided: boolean }) => [
          e.number,
          e.change,
          e.balance,
          e.voided,
        ],
      ),
    ).toEqual([
      [first.number, 200000, 200000, false],
      ['BYH-20261022-0001', -50000, 150000, false],
      [second.number, 200000, 350000, false],
      [payment.number, -100000, 250000, false],
      [voidedPayment.number, -30000, 250000, true],
    ]);
    expect(ledger.supplier.balance).toBe(250000);
    const payables = (await api('GET', '/api/payables')).json();
    expect(payables.totalRemaining).toBe(250000);
    reconcile();
  });
});

describe('Done when: stock and payables reconcile with movements and allocations', () => {
  it('holds through random purchases, payments, voids, adjustments, sales, and opname', async () => {
    const suppliers = [await newSupplier('A'), await newSupplier('B')];
    const products = [indomie, gula];
    // Deterministic pseudo-random sequence.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      // High bits: the low bits of this generator cycle quickly.
      return Math.floor(seed / 2 ** 16) % n;
    };
    const sembako = (await api('GET', '/api/categories'))
      .json()
      .categories.find((c: { name: string }) => c.name === 'Sembako').id;
    let opnameId: string | null = null;

    for (let step = 0; step < 80; step++) {
      h.clock.advance(1000);
      const supplier = suppliers[rand(2)] as Supplier;
      const action = rand(8);
      if (action <= 1) {
        const qty = 1 + rand(5);
        const body = {
          id: crypto.randomUUID(),
          supplierId: supplier.id,
          lines: [
            {
              productId: indomie.id,
              unitId: unitOf(indomie, 'dus'),
              qtyBase: qty * 40,
              buyPrice: 95000 + rand(10) * 1000,
              newCostPrice: 2500,
            },
            {
              productId: gula.id,
              unitId: unitOf(gula, 'kg'),
              qtyBase: 100 + rand(5000),
              buyPrice: 13000 + rand(2000),
              newCostPrice: 14000,
            },
          ],
          paidAmount: rand(2) === 0 ? 0 : rand(100000),
        };
        expect((await api('POST', '/api/purchases', body)).statusCode).toBe(201);
      } else if (action === 2) {
        const open = (await api('GET', `/api/payables?supplierId=${supplier.id}`)).json()
          .purchases as Purchase[];
        if (open.length === 0) continue;
        const ticked = open.filter((_, i) => i === 0 || rand(2) === 1);
        const total = ticked.reduce((s, p) => s + p.remaining, 0);
        const res = await paySupplier(
          supplier,
          ticked.map((p) => p.id),
          1 + rand(total),
        );
        expect(res.statusCode).toBe(201);
      } else if (action === 3) {
        const payments = h.handle.sqlite
          .prepare("select id from supplier_payments where status = 'active'")
          .all() as { id: string }[];
        const target = payments[rand(Math.max(payments.length, 1))];
        if (!target) continue;
        const res = await api('POST', `/api/supplier-payments/${target.id}/void`, {
          reason: 'salah_input',
        });
        expect(res.statusCode).toBe(200);
      } else if (action === 4) {
        const list = (await api('GET', '/api/purchases?status=completed')).json()
          .purchases as Purchase[];
        const target = list[rand(Math.max(list.length, 1))];
        if (!target) continue;
        const url = `/api/purchases/${target.id}/void`;
        const res = await api('POST', url, { reason: 'salah_input' });
        if (res.statusCode === 409) {
          // Refused while a debt payment is active: void those payments, then the purchase.
          expect(res.json().error.code).toBe('PURCHASE_HAS_PAYMENTS');
          for (const p of (await getPurchase(target.id)).payments) {
            if (p.initial || p.status !== 'active') continue;
            await api('POST', `/api/supplier-payments/${p.paymentId}/void`, {
              reason: 'salah_input',
            });
          }
          expect((await api('POST', url, { reason: 'salah_input' })).statusCode).toBe(200);
        } else {
          expect(res.statusCode).toBe(200);
        }
      } else if (action === 5) {
        const product = products[rand(2)] as Product;
        const res = await api('POST', '/api/stock-adjustments', {
          productId: product.id,
          qtyChange: rand(2) === 0 ? -(1 + rand(30)) : 1 + rand(30),
          reason: 'rusak',
        });
        expect(res.statusCode).toBe(201);
      } else if (action === 6) {
        const qty = 1 + rand(20);
        const res = await api('POST', '/api/sales', {
          id: crypto.randomUUID(),
          lines: [{ productId: indomie.id, unitId: unitOf(indomie, 'pcs'), qtyBase: qty }],
          cash: qty * 3500,
          qris: 0,
          expectedTotal: qty * 3500,
        });
        expect(res.statusCode).toBe(201);
      } else if (opnameId === null) {
        const res = await api('POST', '/api/stock-opname', { categoryId: sembako });
        expect(res.statusCode).toBe(201);
        opnameId = res.json().opname.id;
        await api('PUT', `/api/stock-opname/${opnameId}/items`, {
          items: [{ productId: indomie.id, countedQty: rand(100) }],
        });
      } else {
        const res = await api('POST', `/api/stock-opname/${opnameId}/complete`);
        expect(res.statusCode).toBe(200);
        opnameId = null;
      }

      reconcile();
      for (const s of suppliers) {
        const sums = h.handle.sqlite
          .prepare(
            `select
               (select coalesce(sum(remaining), 0) from purchases where supplier_id = ? and status = 'completed') as open_remaining,
               (select coalesce(sum(total), 0) from purchases where supplier_id = ? and status = 'completed') as bought,
               (select coalesce(sum(amount), 0) from supplier_payments where supplier_id = ? and status = 'active') as paid`,
          )
          .get(s.id, s.id, s.id) as { open_remaining: number; bought: number; paid: number };
        expect(sums.open_remaining).toBe(sums.bought - sums.paid);
        const ledger = (await api('GET', `/api/suppliers/${s.id}/ledger`)).json();
        expect(ledger.supplier.balance).toBe(sums.open_remaining);
        expect(ledger.entries.at(-1)?.balance ?? 0).toBe(sums.open_remaining);
      }
    }
    // The sequence exercised every kind of write.
    const counts = h.handle.sqlite
      .prepare(
        `select
           (select count(*) from purchases where status = 'voided') as voided_purchases,
           (select count(*) from supplier_payments where status = 'voided' and initial_purchase_id is null) as voided_payments,
           (select count(*) from supplier_payments where initial_purchase_id is not null) as initial_payments,
           (select count(*) from stock_opnames where status = 'completed') as opnames,
           (select count(*) from stock_movements where type = 'sale') as sales`,
      )
      .get() as Record<string, number>;
    for (const [name, n] of Object.entries(counts)) expect(n, name).toBeGreaterThan(0);
  }, 60_000);
});
