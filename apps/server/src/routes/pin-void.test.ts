import type { Customer, CustomerPayment, Product, Sale } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sumMovements } from '../repositories/stock-repository';
import { ACTION_TOKEN_MS, MENU_TOKEN_MS } from '../security/approvals';
import { paymentReceiptLines, receiptLines } from '../services/receipt-service';
import { getSettings } from '../services/settings-service';
import {
  activeCashier,
  asProductInput,
  auditRows,
  createHarness,
  createProductAs,
  createUserAs,
  type Harness,
  login,
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
let cashierToken: string;
let beras: Product;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
  ({ token: cashierToken } = await activeCashier(h, ownerToken));
  beras = await createProductAs(h, ownerToken, {
    code: 'BRS',
    name: 'Beras 5 kg',
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'karung',
    costPrice: 60000,
    units: [{ name: 'karung', isi: 1, sellPrice: 70000, isBase: true }],
    initialStock: 10,
  });
});

afterEach(async () => {
  await h.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';

const api = (method: Method, url: string, token: string, payload?: object, approval?: string) =>
  h.app.inject({
    method,
    url,
    headers: { ...withSession(token), ...(approval ? { 'x-approval-token': approval } : {}) },
    ...(payload ? { payload } : {}),
  });

async function approve(scope: string, targetId?: string, pin = OWNER.pin, token = cashierToken) {
  return api('POST', '/api/auth/approve', token, { pin, scope, ...(targetId ? { targetId } : {}) });
}

async function approvalToken(scope: string, targetId?: string): Promise<string> {
  const res = await approve(scope, targetId);
  if (res.statusCode !== 200) throw new Error(`approve failed: ${res.statusCode} ${res.body}`);
  return res.json().token;
}

async function sell(karung: number, cash: number, customer?: Customer): Promise<Sale> {
  const res = await api('POST', '/api/sales', cashierToken, {
    id: crypto.randomUUID(),
    lines: [{ productId: beras.id, unitId: beras.units[0]?.id, qtyBase: karung }],
    cash,
    qris: 0,
    expectedTotal: karung * 70000,
    ...(customer ? { customerId: customer.id } : {}),
  });
  if (res.statusCode !== 201) throw new Error(`sale failed: ${res.statusCode} ${res.body}`);
  return res.json().sale;
}

const stockOf = async () =>
  (await api('GET', `/api/products/${beras.id}`, ownerToken)).json().product.stock as number;

describe('lock screen', () => {
  it('locks the session until the same user enters their PIN', async () => {
    expect((await api('POST', '/api/auth/lock', cashierToken)).statusCode).toBe(204);
    expect((await api('GET', '/api/auth/me', cashierToken)).json()).toMatchObject({
      locked: true,
    });
    const blocked = await api('GET', '/api/products', cashierToken);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('SESSION_LOCKED');

    const wrong = await api('POST', '/api/auth/unlock', cashierToken, { pin: OWNER.pin });
    expect(wrong.json().error.code).toBe('WRONG_PIN');
    expect(auditRows(h, 'auth').at(-1)).toMatchObject({
      action: 'failed_pin',
      userId: userIdOf(h, 'kasir1'),
      newValue: { context: 'unlock' },
    });

    const ok = await api('POST', '/api/auth/unlock', cashierToken, { pin: '565656' });
    expect(ok.json()).toMatchObject({ locked: false, user: { username: 'kasir1' } });
    expect((await api('GET', '/api/products', cashierToken)).statusCode).toBe(200);
  });

  it('stays locked across a server restart, and logout still works', async () => {
    await api('POST', '/api/auth/lock', cashierToken);
    await h.restart();
    expect((await api('GET', '/api/auth/me', cashierToken)).json().locked).toBe(true);
    expect((await api('POST', '/api/auth/logout', cashierToken)).statusCode).toBe(204);
    expect((await api('GET', '/api/auth/me', cashierToken)).statusCode).toBe(401);
  });
});

describe('owner approval', () => {
  it('refuses a wrong owner PIN and audit-logs the attempt', async () => {
    const res = await approve('pengguna', undefined, '999999');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('WRONG_OWNER_PIN');
    expect(auditRows(h, 'auth')).toMatchObject([
      {
        userId: userIdOf(h, 'kasir1'),
        action: 'failed_pin',
        newValue: { context: 'approve', scope: 'pengguna' },
      },
    ]);
  });

  it('with several owners, checks the PIN of the chosen owner only; grants audit-logged', async () => {
    await createUserAs(h, ownerToken, {
      username: 'pak',
      name: 'Pak Joko',
      role: 'owner',
      pin: '424242',
    });
    const withoutOwner = await approve('pengguna', undefined, '424242');
    expect(withoutOwner.json().error.code).toBe('OWNER_REQUIRED');
    // Bu Sari's PIN does not approve for Pak Joko.
    const wrongOwner = await api('POST', '/api/auth/approve', cashierToken, {
      pin: OWNER.pin,
      scope: 'pengguna',
      ownerId: userIdOf(h, 'pak'),
    });
    expect(wrongOwner.json().error.code).toBe('WRONG_OWNER_PIN');
    const res = await api('POST', '/api/auth/approve', cashierToken, {
      pin: '424242',
      scope: 'pengguna',
      ownerId: userIdOf(h, 'pak'),
    });
    expect(res.json()).toMatchObject({ ownerName: 'Pak Joko' });
    const grants = h.handle.sqlite
      .prepare("select user_id, approved_by, action from audit_logs where entity = 'approval'")
      .all();
    expect(grants).toEqual([
      { user_id: userIdOf(h, 'kasir1'), approved_by: userIdOf(h, 'pak'), action: 'grant' },
    ]);
  });

  describe('menu tokens', () => {
    it('open the menu for many requests until released', async () => {
      const token = await approvalToken('pengguna');
      for (let i = 0; i < 3; i++) {
        expect((await api('GET', '/api/users', cashierToken, undefined, token)).statusCode).toBe(
          200,
        );
      }
      await api('POST', '/api/auth/approve/release', cashierToken, { token });
      const after = await api('GET', '/api/users', cashierToken, undefined, token);
      expect(after.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    });

    it('expire after 15 minutes', async () => {
      const token = await approvalToken('pengguna');
      h.clock.advance(MENU_TOKEN_MS - 1000);
      expect((await api('GET', '/api/users', cashierToken, undefined, token)).statusCode).toBe(200);
      h.clock.advance(2000);
      expect((await api('GET', '/api/users', cashierToken, undefined, token)).statusCode).toBe(403);
    });

    it('end when the screen is locked', async () => {
      const token = await approvalToken('pengguna');
      await api('POST', '/api/auth/lock', cashierToken);
      await api('POST', '/api/auth/unlock', cashierToken, { pin: '565656' });
      expect((await api('GET', '/api/users', cashierToken, undefined, token)).statusCode).toBe(403);
    });

    it('only work for their own session and menu', async () => {
      const token = await approvalToken('pengguna');
      const otherSession = await login(h, 'kasir1', '565656');
      expect((await api('GET', '/api/users', otherSession, undefined, token)).statusCode).toBe(403);
      const settings = await api('PUT', '/api/settings', cashierToken, { storeName: 'X' }, token);
      expect(settings.statusCode).toBe(403);
    });
  });

  describe('action tokens', () => {
    const priceChange = (sellPrice: number) => {
      const body = asProductInput(beras);
      return {
        ...body,
        units: (body.units as Record<string, unknown>[]).map((u) => ({ ...u, sellPrice })),
      };
    };

    it('let a cashier change a price once, recording the approving owner', async () => {
      const token = await approvalToken('product.price', beras.id);
      const ok = await api(
        'PUT',
        `/api/products/${beras.id}`,
        cashierToken,
        priceChange(72000),
        token,
      );
      expect(ok.statusCode).toBe(200);
      expect(auditRows(h, 'product_unit').at(-1)).toMatchObject({ action: 'update' });
      const row = h.handle.sqlite
        .prepare(
          "select user_id, approved_by from audit_logs where entity = 'product_unit' order by rowid desc limit 1",
        )
        .get();
      expect(row).toEqual({ user_id: userIdOf(h, 'kasir1'), approved_by: userIdOf(h, 'pemilik') });
      const again = await api(
        'PUT',
        `/api/products/${beras.id}`,
        cashierToken,
        priceChange(73000),
        token,
      );
      expect(again.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    });

    it('are tied to their target', async () => {
      const token = await approvalToken('product.price', 'some-other-product');
      const res = await api(
        'PUT',
        `/api/products/${beras.id}`,
        cashierToken,
        priceChange(72000),
        token,
      );
      expect(res.statusCode).toBe(403);
    });

    it('are not spent by a failed request', async () => {
      const token = await approvalToken('product.price', beras.id);
      const bad = await api(
        'PUT',
        `/api/products/${beras.id}`,
        cashierToken,
        { ...priceChange(72000), units: [] },
        token,
      );
      expect(bad.statusCode).toBe(400);
      const ok = await api(
        'PUT',
        `/api/products/${beras.id}`,
        cashierToken,
        priceChange(72000),
        token,
      );
      expect(ok.statusCode).toBe(200);
    });

    it('expire after 5 minutes unused', async () => {
      const token = await approvalToken('product.deactivate', beras.id);
      h.clock.advance(ACTION_TOKEN_MS);
      const res = await api(
        'PATCH',
        `/api/products/${beras.id}/active`,
        cashierToken,
        { active: false },
        token,
      );
      expect(res.statusCode).toBe(403);
    });

    it('cover product deactivation and category changes', async () => {
      const deactivate = await approvalToken('product.deactivate', beras.id);
      expect(
        (
          await api(
            'PATCH',
            `/api/products/${beras.id}/active`,
            cashierToken,
            { active: false },
            deactivate,
          )
        ).statusCode,
      ).toBe(200);
      const category = await approvalToken('category.manage');
      const created = await api(
        'POST',
        '/api/categories',
        cashierToken,
        { name: 'Minuman' },
        category,
      );
      expect(created.statusCode).toBe(201);
    });
  });

  it('is never needed by owners', async () => {
    expect((await api('GET', '/api/users', ownerToken)).statusCode).toBe(200);
    expect(
      (await api('PUT', '/api/settings', ownerToken, { storeName: 'Toko Sari' })).statusCode,
    ).toBe(200);
  });
});

describe('settings', () => {
  it('saves only changed keys, audit-logging each, behind the Profil Toko menu', async () => {
    const token = await approvalToken('profil-toko');
    const res = await api(
      'PUT',
      '/api/settings',
      cashierToken,
      { storeName: 'Toko Sari', rounding: '500', receiptWidth: '58', autoLockMinutes: 10 },
      token,
    );
    expect(res.json().settings).toMatchObject({
      storeName: 'Toko Sari',
      rounding: '500',
      receiptWidth: '58',
      autoLockMinutes: 10,
    });
    // receipt_width was already 58 by default but not stored: it is written once.
    expect(auditRows(h, 'setting').map((r) => [r.entityId, r.oldValue, r.newValue])).toEqual([
      ['store_name', null, 'Toko Sari'],
      ['rounding', null, '500'],
      ['receipt_width', null, '58'],
      ['auto_lock_minutes', null, '10'],
    ]);
    const again = await api(
      'PUT',
      '/api/settings',
      cashierToken,
      { storeName: 'Toko Sari' },
      token,
    );
    expect(again.statusCode).toBe(200);
    expect(auditRows(h, 'setting')).toHaveLength(4);
  });

  it('validates values', async () => {
    const res = await api('PUT', '/api/settings', ownerToken, { autoLockMinutes: 0 });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('sale void', () => {
  let customer: Customer;

  beforeEach(async () => {
    customer = (await api('POST', '/api/customers', cashierToken, { name: 'Pak Budi' })).json()
      .customer;
  });

  const voidSale = (sale: Sale, token = ownerToken, approval?: string) =>
    api('POST', `/api/sales/${sale.id}/void`, token, { reason: 'salah_input' }, approval);

  it('returns stock, voids the kasbon, and is audit-logged', async () => {
    const sale = await sell(2, 40000, customer);
    expect(await stockOf()).toBe(8);
    const res = await voidSale(sale);
    expect(res.statusCode).toBe(200);
    expect(res.json().sale).toMatchObject({ status: 'voided' });
    expect(res.json().sale.voidedAt).toBe(h.clock.now.toISOString());
    expect(await stockOf()).toBe(10);
    expect(sumMovements(h.handle.db, beras.id)).toBe(10);
    const movement = h.handle.sqlite
      .prepare("select qty_change from stock_movements where type = 'void'")
      .get();
    expect(movement).toEqual({ qty_change: 2 });
    expect(
      (await api('GET', `/api/customers/${customer.id}`, ownerToken)).json().customer.balance,
    ).toBe(0);
    expect(auditRows(h, 'sale')).toMatchObject([
      { entityId: sale.id, action: 'void', newValue: { status: 'voided', reason: 'Salah input' } },
    ]);
    const lines = receiptLines(res.json().sale, getSettings(h.handle.db), { copy: true });
    expect(lines).toContain('       *** DIBATALKAN ***');
  });

  it('requires a reason, and a note for "Lainnya"', async () => {
    const sale = await sell(1, 70000);
    const missing = await api('POST', `/api/sales/${sale.id}/void`, ownerToken, {});
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    const noNote = await api('POST', `/api/sales/${sale.id}/void`, ownerToken, {
      reason: 'lainnya',
    });
    expect(noNote.json().error.message).toBe('Data tidak valid pada kolom "note".');
    const ok = await api('POST', `/api/sales/${sale.id}/void`, ownerToken, {
      reason: 'lainnya',
      note: 'Barang rusak',
    });
    expect(ok.statusCode).toBe(200);
    const row = h.handle.sqlite.prepare('select void_reason from sales where id = ?').get(sale.id);
    expect(row).toEqual({ void_reason: 'Lainnya: Barang rusak' });
  });

  it('cannot void twice', async () => {
    const sale = await sell(1, 70000);
    await voidSale(sale);
    expect((await voidSale(sale)).json().error.code).toBe('SALE_NOT_VOIDABLE');
  });

  it('is refused while its kasbon has active payments, then allowed after voiding them', async () => {
    const sale = await sell(1, 20000, customer);
    const [receivable] = (
      await api('GET', `/api/receivables?customerId=${customer.id}`, ownerToken)
    ).json().receivables;
    const payment = (
      await api('POST', '/api/customer-payments', cashierToken, {
        id: crypto.randomUUID(),
        customerId: customer.id,
        receivableIds: [receivable.id],
        method: 'cash',
        amount: 10000,
      })
    ).json().payment as CustomerPayment;
    const refused = await voidSale(sale);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('SALE_HAS_PAYMENTS');

    expect(
      (
        await api('POST', `/api/customer-payments/${payment.id}/void`, ownerToken, {
          reason: 'pembeli_batal',
        })
      ).statusCode,
    ).toBe(200);
    expect((await voidSale(sale)).statusCode).toBe(200);
    expect(
      (await api('GET', `/api/customers/${customer.id}`, ownerToken)).json().customer.balance,
    ).toBe(0);
  });

  it('needs an owner approval for this sale when a cashier voids', async () => {
    const sale = await sell(1, 70000);
    const other = await sell(1, 70000);
    expect((await voidSale(sale, cashierToken)).json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    const wrongTarget = await approvalToken('sale.void', other.id);
    expect((await voidSale(sale, cashierToken, wrongTarget)).statusCode).toBe(403);
    const token = await approvalToken('sale.void', sale.id);
    const res = await voidSale(sale, cashierToken, token);
    expect(res.statusCode).toBe(200);
    const row = h.handle.sqlite
      .prepare(
        "select user_id, approved_by from audit_logs where entity = 'sale' and action = 'void'",
      )
      .get();
    expect(row).toEqual({ user_id: userIdOf(h, 'kasir1'), approved_by: userIdOf(h, 'pemilik') });
    const voided = h.handle.sqlite.prepare('select voided_by from sales where id = ?').get(sale.id);
    expect(voided).toEqual({ voided_by: userIdOf(h, 'kasir1') });
  });

  it('shows voided sales under the voided filter', async () => {
    const sale = await sell(1, 70000);
    await voidSale(sale);
    const list = (await api('GET', '/api/sales?status=voided', ownerToken)).json();
    expect(list.sales.map((s: Sale) => s.number)).toEqual([sale.number]);
  });
});

describe('customer payment void', () => {
  it('restores the receivables and the balance; audit-logged; receipt marked', async () => {
    const customer = (await api('POST', '/api/customers', cashierToken, { name: 'Bu Tini' })).json()
      .customer as Customer;
    await sell(1, 20000, customer); // kasbon 50.000
    await sell(1, 60000, customer); // kasbon 10.000
    const receivables = (
      await api('GET', `/api/receivables?customerId=${customer.id}`, ownerToken)
    ).json().receivables;
    const payment = (
      await api('POST', '/api/customer-payments', cashierToken, {
        id: crypto.randomUUID(),
        customerId: customer.id,
        receivableIds: receivables.map((r: { id: string }) => r.id),
        method: 'cash',
        amount: 55000,
      })
    ).json().payment as CustomerPayment;
    const balance = async () =>
      (await api('GET', `/api/customers/${customer.id}`, ownerToken)).json().customer.balance;
    expect(await balance()).toBe(5000);

    expect(
      (
        await api('POST', `/api/customer-payments/${payment.id}/void`, cashierToken, {
          reason: 'pembeli_batal',
        })
      ).json().error.code,
    ).toBe('OWNER_APPROVAL_REQUIRED');
    const token = await approvalToken('payment.void', payment.id);
    const res = await api(
      'POST',
      `/api/customer-payments/${payment.id}/void`,
      cashierToken,
      { reason: 'lainnya', note: 'Uang palsu' },
      token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().payment.status).toBe('voided');
    expect(await balance()).toBe(60000);
    const after = (
      await api('GET', `/api/receivables?customerId=${customer.id}`, ownerToken)
    ).json().receivables;
    expect(
      after.map((r: { remaining: number; status: string }) => [r.remaining, r.status]),
    ).toEqual([
      [50000, 'open'],
      [10000, 'open'],
    ]);
    expect(auditRows(h, 'customer_payment')).toMatchObject([
      { entityId: payment.id, action: 'void', newValue: { reason: 'Lainnya: Uang palsu' } },
    ]);
    const lines = paymentReceiptLines(res.json().payment, getSettings(h.handle.db));
    expect(lines).toContain('       *** DIBATALKAN ***');
    expect(
      (
        await api('POST', `/api/customer-payments/${payment.id}/void`, ownerToken, {
          reason: 'pembeli_batal',
        })
      ).json().error.code,
    ).toBe('PAYMENT_NOT_VOIDABLE');

    // remaining = amount - active allocations still holds after the void.
    const bad = h.handle.sqlite
      .prepare(
        `select r.id from receivables r
         where r.remaining != r.amount - coalesce((select sum(a.amount) from payment_allocations a
           join customer_payments p on p.id = a.payment_id
           where a.receivable_id = r.id and p.status = 'active'), 0)`,
      )
      .all();
    expect(bad).toEqual([]);
  });
});
