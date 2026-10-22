import fs from 'node:fs';
import path from 'node:path';
import type { Sale, Settings } from '@toko-podomoro/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSetting } from '../repositories/settings-repository';
import { receiptLines } from '../services/receipt-service';
import {
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

const settings: Settings = {
  storeName: 'TOKO PODOMORO',
  storeAddress: 'Jl. Melati 5, Sleman',
  storePhone: '0812-3456-789',
  receiptFooter: 'Terima kasih',
  rounding: '100',
  receiptWidth: '58',
  receiptFolder: '/tmp/nota',
  autoLockMinutes: 5,
};

const sale: Sale = {
  id: 's1',
  number: 'TRX-20261022-0007',
  status: 'completed',
  cashierId: 'u1',
  cashierName: 'Rina',
  subtotal: 32850,
  roundingAmount: 50,
  total: 32900,
  paidTotal: 50000,
  changeAmount: 17100,
  debtAmount: 0,
  itemCount: 2,
  receiptCount: 0,
  completedAt: '2026-10-22T07:05:00.000Z',
  voidedAt: null,
  createdAt: '2026-10-22T07:05:00.000Z',
  items: [
    {
      id: 'i1',
      productId: 'p1',
      unitId: 'u1',
      productCode: 'GULA',
      productName: 'Gula Pasir',
      unitName: 'kg',
      qtyBase: 1500,
      unitFactor: 1000,
      unitPrice: 17500,
      subtotal: 26250,
    },
    {
      id: 'i2',
      productId: 'p2',
      unitId: 'u2',
      productCode: 'SAM',
      productName: 'Sampoerna Mild Filter 16 Batang Edisi Spesial',
      unitName: 'batang',
      qtyBase: 3,
      unitFactor: 1,
      unitPrice: 2200,
      subtotal: 6600,
    },
  ],
  payments: [{ method: 'cash', amount: 50000 }],
};

describe('receiptLines', () => {
  it('lays out a 58 mm receipt in 32 columns', () => {
    expect(receiptLines(sale, settings, { copy: false })).toEqual([
      '         TOKO PODOMORO',
      '      Jl. Melati 5, Sleman',
      '         0812-3456-789',
      '--------------------------------',
      'No             TRX-20261022-0007',
      'Tanggal         22/10/2026 14:05',
      'Kasir                       Rina',
      '--------------------------------',
      'Gula Pasir',
      '  1,5 kg x 17.500         26.250',
      'Sampoerna Mild Filter 16 Batang',
      'Edisi Spesial',
      '  3 batang x 2.200         6.600',
      '--------------------------------',
      'Subtotal                  32.850',
      'Pembulatan                    50',
      'TOTAL                  Rp 32.900',
      'Tunai                     50.000',
      'Kembali                   17.100',
      '--------------------------------',
      '          Terima kasih',
    ]);
  });

  it('marks copies and voided sales', () => {
    const lines = receiptLines({ ...sale, status: 'voided' }, settings, { copy: true });
    expect(lines).toContain('        *** SALINAN ***');
    expect(lines).toContain('       *** DIBATALKAN ***');
  });

  it('uses 42 columns on 80 mm paper', () => {
    const lines = receiptLines(sale, { ...settings, receiptWidth: '80' }, { copy: false });
    expect(Math.max(...lines.map((l) => l.length))).toBe(42);
  });
});

describe('receipt endpoints', () => {
  let h: Harness;
  let ownerToken: string;
  let saleId: string;
  let number: string;

  beforeEach(async () => {
    h = await createHarness();
    ({ token: ownerToken } = await setupOwner(h));
    const product = await createProductAs(h, ownerToken, {
      code: 'IDM',
      name: 'Indomie Goreng',
      category: 'Sembako',
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: 2900,
      units: [{ name: 'pcs', factor: 1, sellPrice: 3500, isBase: true }],
    });
    const res = await api('POST', '/api/sales', {
      id: crypto.randomUUID(),
      lines: [{ productId: product.id, unitId: product.units[0]?.id, qtyBase: 2 }],
      cash: 10000,
      qris: 0,
      expectedTotal: 7000,
    });
    ({ id: saleId, number } = res.json().sale);
  });

  afterEach(async () => {
    await h.close();
  });

  const api = (method: 'GET' | 'POST', url: string, payload?: object) =>
    h.app.inject({
      method,
      url,
      headers: withSession(ownerToken),
      ...(payload ? { payload } : {}),
    });

  it('saves the original, then copies, to the receipt folder', async () => {
    const first = await api('POST', `/api/sales/${saleId}/receipt`);
    expect(first.json()).toEqual({ fileName: `${number}.pdf`, folder: h.receiptDir, copy: false });
    const file = path.join(h.receiptDir, `${number}.pdf`);
    expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');

    const second = await api('POST', `/api/sales/${saleId}/receipt`);
    expect(second.json()).toMatchObject({ fileName: `${number}-SALINAN.pdf`, copy: true });
    expect(fs.existsSync(path.join(h.receiptDir, `${number}-SALINAN.pdf`))).toBe(true);
    expect((await api('GET', `/api/sales/${saleId}`)).json().sale.receiptCount).toBe(2);
  });

  it('opens the saved receipt and the folder with the OS', async () => {
    const before = await api('POST', `/api/sales/${saleId}/receipt/open`);
    expect(before.statusCode).toBe(404);
    expect(before.json().error.code).toBe('RECEIPT_NOT_SAVED');

    await api('POST', `/api/sales/${saleId}/receipt`);
    expect((await api('POST', `/api/sales/${saleId}/receipt/open`)).statusCode).toBe(204);
    expect((await api('POST', '/api/receipts/open-folder')).statusCode).toBe(204);
    expect(h.opened).toEqual([path.join(h.receiptDir, `${number}.pdf`), h.receiptDir]);
  });

  it('downloads a PDF; after a saved receipt it is a copy', async () => {
    await api('POST', `/api/sales/${saleId}/receipt`);
    const res = await api('GET', `/api/sales/${saleId}/receipt.pdf`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${number}-SALINAN.pdf"`);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('reports a receipt folder that cannot be written', async () => {
    const blocker = path.join(h.receiptDir, '..', 'not-a-folder');
    fs.writeFileSync(blocker, 'x');
    writeSetting(h.handle.db, 'receipt_folder', blocker);
    const res = await api('POST', `/api/sales/${saleId}/receipt`);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('RECEIPT_SAVE_FAILED');
  });

  it('returns 404 for unknown sales', async () => {
    expect((await api('POST', '/api/sales/nope/receipt')).statusCode).toBe(404);
  });
});
