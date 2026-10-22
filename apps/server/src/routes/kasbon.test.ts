import type { Customer, CustomerPayment, Product, Sale } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentReceiptLines, receiptLines } from '../services/receipt-service';
import { getSettings } from '../services/settings-service';
import {
  activeCashier,
  auditRows,
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
let beras: Product;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
  beras = await createProductAs(h, ownerToken, {
    code: 'BRS',
    name: 'Beras 5 kg',
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'karung',
    costPrice: 60000,
    units: [{ name: 'karung', factor: 1, sellPrice: 70000, isBase: true }],
    initialStock: 1000,
  });
});

afterEach(async () => {
  await h.close();
});

const api = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, token = ownerToken) =>
  h.app.inject({ method, url, headers: withSession(token), ...(payload ? { payload } : {}) });

async function newCustomer(name = 'Pak Budi', token = ownerToken): Promise<Customer> {
  const res = await api('POST', '/api/customers', { name, phone: '0812' }, token);
  if (res.statusCode !== 201) throw new Error(`customer failed: ${res.statusCode} ${res.body}`);
  return res.json().customer;
}

/** A sale of `karung` sacks (Rp 70.000 each) paying `cash`; the rest is kasbon. */
async function kasbonSale(customer: Customer | null, karung: number, cash: number) {
  return api('POST', '/api/sales', {
    id: crypto.randomUUID(),
    lines: [{ productId: beras.id, unitId: beras.units[0]?.id, qtyBase: karung }],
    cash,
    qris: 0,
    expectedTotal: karung * 70000,
    ...(customer ? { customerId: customer.id } : {}),
  });
}

async function pay(
  customer: Customer,
  receivableIds: string[],
  amount: number,
  method: 'cash' | 'qris' = 'cash',
) {
  return api('POST', '/api/customer-payments', {
    id: crypto.randomUUID(),
    customerId: customer.id,
    receivableIds,
    method,
    amount,
  });
}

const openReceivables = async (customer: Customer) =>
  (await api('GET', `/api/receivables?customerId=${customer.id}`)).json().receivables as {
    id: string;
    saleNumber: string;
    amount: number;
    remaining: number;
    status: string;
  }[];

const balanceOf = async (customer: Customer) =>
  (await api('GET', `/api/customers/${customer.id}`)).json().customer.balance as number;

describe('customers', () => {
  it('lets cashiers add customers; every change is audit-logged', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const customer = await newCustomer('Bu Tini', token);
    expect(customer).toMatchObject({ name: 'Bu Tini', phone: '0812', note: null, balance: 0 });
    const res = await api(
      'PUT',
      `/api/customers/${customer.id}`,
      { note: 'Blok C', phone: '' },
      token,
    );
    expect(res.json().customer).toMatchObject({ note: 'Blok C', phone: null });
    expect(auditRows(h, 'customer').map((r) => r.action)).toEqual(['create', 'update']);
  });

  it('searches by name or phone, active by default', async () => {
    const budi = await newCustomer('Pak Budi');
    await newCustomer('Bu Tini');
    await api('PUT', `/api/customers/${budi.id}`, { active: false });
    const list = async (q: string) =>
      (await api('GET', `/api/customers${q}`)).json().customers.map((c: Customer) => c.name);
    expect(await list('')).toEqual(['Bu Tini']);
    expect(await list('?status=all&q=budi')).toEqual(['Pak Budi']);
    expect(await list('?status=all&q=0812')).toEqual(['Bu Tini', 'Pak Budi']);
  });

  it('refuses to deactivate a customer with remaining kasbon', async () => {
    const customer = await newCustomer();
    await kasbonSale(customer, 1, 20000);
    const res = await api('PUT', `/api/customers/${customer.id}`, { active: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe(
      'Pelanggan masih punya kasbon Rp 50.000. Lunasi dulu sebelum menonaktifkan.',
    );
  });
});

describe('kasbon sales', () => {
  it('refuses underpayment without a customer', async () => {
    const res = await kasbonSale(null, 1, 20000);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNDERPAID');
  });

  it('records the shortfall as one receivable and snapshots the balance', async () => {
    const customer = await newCustomer();
    const first = (await kasbonSale(customer, 1, 20000)).json().sale as Sale;
    expect(first).toMatchObject({
      customerName: 'Pak Budi',
      paidTotal: 20000,
      changeAmount: 0,
      debtAmount: 50000,
      customerBalanceAfter: 50000,
    });
    const second = (await kasbonSale(customer, 2, 0)).json().sale as Sale;
    expect(second.customerBalanceAfter).toBe(190000);
    expect((await openReceivables(customer)).map((r) => [r.saleNumber, r.remaining])).toEqual([
      [first.number, 50000],
      [second.number, 140000],
    ]);
    expect(await balanceOf(customer)).toBe(190000);
  });

  it('refuses unknown and inactive customers', async () => {
    const customer = await newCustomer();
    await api('PUT', `/api/customers/${customer.id}`, { active: false });
    expect((await kasbonSale(customer, 1, 0)).json().error.code).toBe('CUSTOMER_INACTIVE');
    const ghost = { ...customer, id: 'nope' };
    expect((await kasbonSale(ghost, 1, 0)).statusCode).toBe(404);
  });

  it('prints customer, kasbon, and remaining kasbon on the sale receipt', async () => {
    const customer = await newCustomer();
    const sale = (await kasbonSale(customer, 1, 20000)).json().sale as Sale;
    const lines = receiptLines(sale, getSettings(h.handle.db), { copy: false });
    expect(lines).toContain('Pelanggan               Pak Budi');
    expect(lines).toContain('Kasbon                    50.000');
    expect(lines).toContain('Sisa kasbon            Rp 50.000');
    expect(lines.some((l) => l.startsWith('Kembali'))).toBe(false);
  });
});

describe('customer payments', () => {
  let customer: Customer;
  let sales: Sale[];

  beforeEach(async () => {
    customer = await newCustomer();
    sales = [];
    for (const [karung, cash] of [
      [1, 20000],
      [1, 40000],
      [1, 60000],
    ] as const) {
      h.clock.advance(60_000);
      sales.push((await kasbonSale(customer, karung, cash)).json().sale);
    }
  });

  it('fills the oldest ticked receivable first; cash change is returned', async () => {
    const all = await openReceivables(customer); // 50.000, 30.000, 10.000
    const res = await pay(
      customer,
      all.map((r) => r.id),
      100000,
    );
    expect(res.statusCode).toBe(201);
    const payment = res.json().payment as CustomerPayment;
    expect(payment).toMatchObject({
      number: 'BYR-20261022-0001',
      method: 'cash',
      amount: 90000,
      amountReceived: 100000,
      changeAmount: 10000,
      balanceAfter: 0,
      allocations: [
        { saleNumber: sales[0]?.number, amount: 50000, remainingAfter: 0 },
        { saleNumber: sales[1]?.number, amount: 30000, remainingAfter: 0 },
        { saleNumber: sales[2]?.number, amount: 10000, remainingAfter: 0 },
      ],
    });
    expect(await openReceivables(customer)).toEqual([]);
    expect(await balanceOf(customer)).toBe(0);
  });

  it('applies a partial amount to the oldest ticked receivables only', async () => {
    const [oldest, middle, newest] = await openReceivables(customer);
    const res = await pay(customer, [newest?.id ?? '', middle?.id ?? ''], 35000);
    expect(res.json().payment).toMatchObject({
      amount: 35000,
      changeAmount: 0,
      balanceAfter: 55000,
      allocations: [
        { saleNumber: sales[1]?.number, amount: 30000, remainingAfter: 0 },
        { saleNumber: sales[2]?.number, amount: 5000, remainingAfter: 5000 },
      ],
    });
    expect((await openReceivables(customer)).map((r) => [r.id, r.remaining])).toEqual([
      [oldest?.id, 50000],
      [newest?.id, 5000],
    ]);
  });

  it('accepts QRIS up to the ticked total and refuses more', async () => {
    const [oldest] = await openReceivables(customer);
    const over = await pay(customer, [oldest?.id ?? ''], 50001, 'qris');
    expect(over.json().error.code).toBe('QRIS_EXCEEDS_KASBON');
    const ok = await pay(customer, [oldest?.id ?? ''], 50000, 'qris');
    expect(ok.json().payment).toMatchObject({ method: 'qris', amount: 50000, changeAmount: 0 });
  });

  it('refuses paid receivables and receivables of another customer', async () => {
    const [oldest] = await openReceivables(customer);
    await pay(customer, [oldest?.id ?? ''], 50000);
    expect((await pay(customer, [oldest?.id ?? ''], 1000)).json().error.code).toBe(
      'INVALID_RECEIVABLES',
    );
    const other = await newCustomer('Bu Tini');
    const [middle] = await openReceivables(customer);
    expect((await pay(other, [middle?.id ?? ''], 1000)).json().error.code).toBe(
      'INVALID_RECEIVABLES',
    );
  });

  it('rejects a second request with the same id', async () => {
    const [oldest] = await openReceivables(customer);
    const payload = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      receivableIds: [oldest?.id],
      method: 'cash',
      amount: 1000,
    };
    expect((await api('POST', '/api/customer-payments', payload)).statusCode).toBe(201);
    const again = await api('POST', '/api/customer-payments', payload);
    expect(again.json().error.code).toBe('DUPLICATE_PAYMENT');
    expect(await balanceOf(customer)).toBe(89000);
  });

  it('numbers payments per local day', async () => {
    const [oldest] = await openReceivables(customer);
    const numbers = [];
    numbers.push((await pay(customer, [oldest?.id ?? ''], 1000)).json().payment.number);
    h.clock.now = new Date('2026-10-22T17:30:00.000Z');
    numbers.push((await pay(customer, [oldest?.id ?? ''], 1000)).json().payment.number);
    expect(numbers).toEqual(['BYR-20261022-0001', 'BYR-20261023-0001']);
  });

  it('shows the ledger with a running balance', async () => {
    const [oldest] = await openReceivables(customer);
    h.clock.advance(60_000);
    await pay(customer, [oldest?.id ?? ''], 20000);
    const ledger = (await api('GET', `/api/customers/${customer.id}/ledger`)).json();
    expect(
      ledger.entries.map((e: { kind: string; change: number; balance: number }) => [
        e.kind,
        e.change,
        e.balance,
      ]),
    ).toEqual([
      ['kasbon', 50000, 50000],
      ['kasbon', 30000, 80000],
      ['kasbon', 10000, 90000],
      ['payment', -20000, 70000],
    ]);
    expect(ledger.customer.balance).toBe(70000);
  });

  it('prints and saves a payment receipt; later ones are copies', async () => {
    const all = await openReceivables(customer);
    const payment = (await pay(customer, all.map((r) => r.id).slice(0, 2), 60000)).json()
      .payment as CustomerPayment;
    const lines = paymentReceiptLines(payment, getSettings(h.handle.db), { copy: false });
    expect(lines).toEqual(
      expect.arrayContaining([
        '       BUKTI BAYAR KASBON',
        'No             BYR-20261022-0001',
        'Pelanggan               Pak Budi',
        `${sales[0]?.number}         50.000`,
        '  sisa                         0',
        `${sales[1]?.number}         10.000`,
        '  sisa                    20.000',
        'DIBAYAR                Rp 60.000',
        'Tunai                     60.000',
        'Kembali                        0',
        'Sisa kasbon            Rp 30.000',
      ]),
    );
    const saved = await api('POST', `/api/customer-payments/${payment.id}/receipt`);
    expect(saved.json()).toMatchObject({ fileName: 'BYR-20261022-0001.pdf', copy: false });
    const copy = await api('GET', `/api/customer-payments/${payment.id}/receipt.pdf`);
    expect(copy.headers['content-disposition']).toContain('BYR-20261022-0001-SALINAN.pdf');
    expect(
      (await api('POST', `/api/customer-payments/${payment.id}/receipt/open`)).statusCode,
    ).toBe(204);
  });
});

describe('Done when: balances always reconcile', () => {
  it('keeps remaining = amount - allocations and balance = sum of remaining through random activity', async () => {
    const customers = [await newCustomer('A'), await newCustomer('B'), await newCustomer('C')];
    // Deterministic pseudo-random sequence.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let step = 0; step < 120; step++) {
      h.clock.advance(1000);
      const customer = customers[rand(3)] as Customer;
      if (rand(3) > 0) {
        const karung = 1 + rand(3);
        const res = await kasbonSale(customer, karung, rand(4) * 10000);
        expect(res.statusCode).toBe(201);
      } else {
        const open = await openReceivables(customer);
        if (open.length === 0) continue;
        const ticked = open.filter((_, i) => i === 0 || rand(2) === 1);
        const total = ticked.reduce((s, r) => s + r.remaining, 0);
        const method = rand(2) === 0 ? 'cash' : 'qris';
        const amount = method === 'qris' ? 1 + rand(total) : 1 + rand(total + 50000);
        const res = await pay(
          customer,
          ticked.map((r) => r.id),
          amount,
          method,
        );
        expect(res.statusCode).toBe(201);
      }

      const db = h.handle.sqlite;
      const badRemaining = db
        .prepare(
          `select r.id from receivables r
           where r.remaining != r.amount - coalesce((select sum(a.amount) from payment_allocations a
             join customer_payments p on p.id = a.payment_id
             where a.receivable_id = r.id and p.status = 'active'), 0)
              or r.remaining < 0
              or (r.status = 'paid') != (r.remaining = 0)`,
        )
        .all();
      expect(badRemaining).toEqual([]);
      const badPayments = db
        .prepare(
          `select p.number from customer_payments p
           where p.amount != (select sum(amount) from payment_allocations a where a.payment_id = p.id)
              or p.change_amount != p.amount_received - p.amount
              or (p.method = 'qris' and p.change_amount != 0)`,
        )
        .all();
      expect(badPayments).toEqual([]);
      for (const c of customers) {
        const sums = db
          .prepare(
            `select
               (select coalesce(sum(remaining), 0) from receivables where customer_id = ? and status = 'open') as open_remaining,
               (select coalesce(sum(debt_amount), 0) from sales where customer_id = ?) as debt,
               (select coalesce(sum(amount), 0) from customer_payments where customer_id = ? and status = 'active') as paid`,
          )
          .get(c.id, c.id, c.id) as { open_remaining: number; debt: number; paid: number };
        expect(sums.open_remaining).toBe(sums.debt - sums.paid);
        expect(await balanceOf(c)).toBe(sums.open_remaining);
      }
    }
    // The latest snapshot on each customer's newest document equals the live balance.
    for (const c of customers) {
      const last = h.handle.sqlite
        .prepare(
          `select balance from (
             select customer_balance_after as balance, created_at from sales where customer_id = ?
             union all select balance_after, created_at from customer_payments where customer_id = ?)
           order by created_at desc limit 1`,
        )
        .get(c.id, c.id) as { balance: number } | undefined;
      if (last) expect(last.balance).toBe(await balanceOf(c));
    }
  });
});
