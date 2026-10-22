import { IMPORT_COLUMNS, type ImportPreviewResponse } from '@toko-podomoro/shared';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sumMovements } from '../repositories/stock-repository';
import { parseCsv } from '../services/import-file';
import { parseWholeNumber } from '../services/product-import-service';
import {
  activeCashier,
  auditRows,
  createHarness,
  createProductAs,
  type Harness,
  OWNER,
  setupOwner,
  withSession,
} from '../testing/harness';

let h: Harness;
let ownerToken: string;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
});

afterEach(async () => {
  await h.close();
});

const HEADER = IMPORT_COLUMNS.join(',');

const csvFile = (lines: string[], fileName = 'barang.csv') => ({
  fileName,
  contentBase64: Buffer.from(lines.join('\r\n'), 'utf8').toString('base64'),
});

const api = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  token = ownerToken,
  payload?: object,
  approval?: string,
) =>
  h.app.inject({
    method,
    url,
    headers: { ...withSession(token), ...(approval ? { 'x-approval-token': approval } : {}) },
    ...(payload ? { payload } : {}),
  });

const preview = (file: object, token = ownerToken, approval?: string) =>
  api('POST', '/api/products/import/preview', token, file, approval);
const commit = (file: object, token = ownerToken, approval?: string) =>
  api('POST', '/api/products/import', token, file, approval);

const count = (table: string): number =>
  (h.handle.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

const productByCode = (code: string) =>
  h.handle.sqlite.prepare('select * from products where code = ?').get(code) as
    | Record<string, unknown>
    | undefined;

const unitsOf = (productId: unknown) =>
  h.handle.sqlite
    .prepare(
      'select name, factor, sell_price, is_base from product_units where product_id = ? order by factor',
    )
    .all(productId);

const VALID = [
  HEADER,
  'IDM-GRG,Indomie Goreng,sembako,satuan,pcs,2900,pcs,3500,dus,40,130000,,,,24',
  'GULA,Gula Pasir,Sembako,curah,gram,15000,,17500,,,,,,,25000',
  'MNY,Minyak Curah,Sembako,curah,ml,18000,liter,"20.000",,,,,,,',
];

describe('POST products/import/preview', () => {
  it('returns every row with the products to be created; nothing is saved', async () => {
    const res = await preview(csvFile(VALID));
    expect(res.statusCode).toBe(200);
    const body: ImportPreviewResponse = res.json();
    expect(body).toMatchObject({ total: 3, valid: 3, invalid: 0 });
    expect(body.rows.map((r) => r.row)).toEqual([2, 3, 4]);
    expect(body.rows[0]?.product).toEqual({
      code: 'IDM-GRG',
      name: 'Indomie Goreng',
      categoryName: 'Sembako',
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: 2900,
      units: [
        { name: 'pcs', factor: 1, sellPrice: 3500, isBase: true },
        { name: 'dus', factor: 40, sellPrice: 130000, isBase: false },
      ],
      initialStock: 24,
    });
    // Bulk: the kg / liter row is created automatically, priced per kg / liter.
    expect(body.rows[1]?.product?.units).toEqual([
      { name: 'kg', factor: 1000, sellPrice: 17500, isBase: true },
    ]);
    expect(body.rows[2]?.product?.units).toEqual([
      { name: 'liter', factor: 1000, sellPrice: 20000, isBase: true },
    ]);
    expect(count('products')).toBe(0);
  });

  it('reports errors per row and still shows the valid rows', async () => {
    await createProductAs(h, ownerToken, {
      code: 'OLD',
      name: 'Barang lama',
      category: 'Sembako',
      type: 'unit',
      baseUnit: 'pcs',
      costPrice: 1000,
      units: [{ name: 'pcs', factor: 1, sellPrice: 1500, isBase: true }],
    });
    const old = productByCode('OLD');
    await api('PATCH', `/api/products/${old?.id}/active`, ownerToken, { active: false });

    const res = await preview(
      csvFile([
        HEADER,
        'OK-1,Barang benar,Rokok,satuan,bks,1000,bks,1200,,,,,,,',
        'old,Kode dipakai,Rokok,satuan,pcs,1000,pcs,1200,,,,,,,',
        'OK-1,Kode ganda,Rokok,satuan,pcs,1000,pcs,1200,,,,,,,',
        'A B,,Minuman,botol,pcs,12.5,pcs,,,,,,,,-3',
        'BLK,Curah salah,Sembako,curah,pcs,1000,pcs,1200,ons,100,500,,,,',
        'GRM,Satuan gram,Sembako,satuan,gram,1000,gram,1200,,,,,,,',
        'XTR,Satuan tambahan,Sembako,satuan,pcs,1000,pcs,1200,dus,,50000,PCS,2,2000,',
      ]),
    );
    expect(res.statusCode).toBe(200);
    const body: ImportPreviewResponse = res.json();
    expect(body).toMatchObject({ total: 7, valid: 1, invalid: 6 });
    const errors = Object.fromEntries(body.rows.map((r) => [r.row, r.errors]));
    expect(errors[2]).toEqual([]);
    expect(errors[3]).toEqual(['Kode sudah dipakai barang lain (termasuk barang nonaktif).']);
    expect(errors[4]).toEqual(['Kode sama dengan baris 2.']);
    expect(errors[5]).toEqual([
      'Kode hanya boleh berisi huruf, angka, dan . _ / - tanpa spasi (maks 32).',
      'Nama wajib diisi.',
      'Kategori "Minuman" tidak ada. Tambahkan dulu di Barang > Kategori.',
      'Jenis harus "satuan" atau "curah".',
      'Harga pokok harus bilangan bulat 0 sampai 1.000.000.000.',
      'Harga jual wajib diisi.',
      'Stok awal harus bilangan bulat 0 sampai 1.000.000.000.',
    ]);
    expect(errors[6]).toEqual([
      'Satuan stok barang curah harus gram atau ml.',
      'Barang curah tidak boleh punya satuan tambahan.',
    ]);
    expect(errors[7]).toEqual(['Satuan stok gram atau ml hanya untuk barang curah.']);
    expect(errors[8]).toEqual([
      'Satuan 2: isi nama, isi, dan harga.',
      'Nama satuan jual tidak boleh sama.',
    ]);
    expect(body.rows[3]?.values).toMatchObject({ kode: 'A B', kategori: 'Minuman' });
    expect(body.rows[3]?.product).toBeNull();
  });

  it('refuses an inactive category and a bulk sell unit that does not match', async () => {
    const created = await api('POST', '/api/categories', ownerToken, { name: 'Minuman' });
    await api('PUT', `/api/categories/${created.json().category.id}`, ownerToken, {
      active: false,
    });
    const body: ImportPreviewResponse = (
      await preview(
        csvFile([
          HEADER,
          'TEH,Teh botol,minuman,satuan,btl,3000,btl,4000,,,,,,,',
          'GULA,Gula Pasir,Sembako,curah,gram,15000,liter,17500,,,,,,,',
        ]),
      )
    ).json();
    expect(body.rows[0]?.errors).toEqual(['Kategori "Minuman" nonaktif.']);
    expect(body.rows[1]?.errors).toEqual(['Satuan jual barang curah harus kg (atau kosongkan).']);
  });

  it('reads semicolon CSV with a BOM, quotes, and columns in any order', async () => {
    const res = await preview({
      fileName: 'BARANG.CSV',
      contentBase64: Buffer.from(
        '﻿nama;kode;kategori;jenis;satuan_stok;harga_pokok;satuan_jual;harga_jual\n"Kopi ""Kapal""; sachet";KOPI;Lain-lain;satuan;sct;1000;sct;1.500\n\n',
      ).toString('base64'),
    });
    const body: ImportPreviewResponse = res.json();
    expect(body).toMatchObject({ total: 1, valid: 1 });
    expect(body.rows[0]?.product).toMatchObject({
      code: 'KOPI',
      name: 'Kopi "Kapal"; sachet',
      initialStock: 0,
      units: [{ name: 'sct', factor: 1, sellPrice: 1500, isBase: true }],
    });
  });

  it('rejects unusable files with a file-level error', async () => {
    const cases: [object, string][] = [
      [{ fileName: 'barang.xls', contentBase64: 'AAAA' }, 'Format file tidak didukung'],
      [csvFile(['kode,nama', 'A,B']), 'Kolom wajib tidak ditemukan'],
      [csvFile([HEADER, ',,,,,,,,,,,,,,']), 'File tidak berisi data barang'],
      [
        { fileName: 'b.csv', contentBase64: Buffer.from([0xff, 0xfe, 0x41]).toString('base64') },
        'UTF-8',
      ],
      [
        { fileName: 'b.xlsx', contentBase64: Buffer.from('bukan excel').toString('base64') },
        'Excel',
      ],
      [
        csvFile([
          HEADER,
          ...Array.from({ length: 2001 }, (_, i) => `K${i},N,Rokok,satuan,pcs,1,pcs,1`),
        ]),
        'Paling banyak 2000 baris',
      ],
    ];
    for (const [file, message] of cases) {
      const res = await preview(file);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IMPORT_FILE_INVALID');
      expect(res.json().error.message).toContain(message);
    }
  });
});

describe('POST products/import', () => {
  it('creates all products in one go, with initial stock and audit rows', async () => {
    const res = await commit(csvFile(VALID));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ imported: 3 });

    const indomie = productByCode('IDM-GRG');
    expect(indomie).toMatchObject({ type: 'unit', base_unit: 'pcs', pricing_factor: 1, stock: 24 });
    expect(unitsOf(indomie?.id)).toEqual([
      { name: 'pcs', factor: 1, sell_price: 3500, is_base: 1 },
      { name: 'dus', factor: 40, sell_price: 130000, is_base: 0 },
    ]);
    const gula = productByCode('GULA');
    expect(gula).toMatchObject({
      type: 'bulk',
      base_unit: 'gram',
      pricing_factor: 1000,
      cost_price: 15000,
      stock: 25000,
    });
    expect(sumMovements(h.handle.db, gula?.id as string)).toBe(25000);
    expect(productByCode('MNY')).toMatchObject({ base_unit: 'ml', stock: 0 });

    const adjustments = h.handle.sqlite
      .prepare(
        'select reason, note, qty_change, cost_price from stock_adjustments order by qty_change',
      )
      .all();
    expect(adjustments).toEqual([
      { reason: 'lainnya', note: 'Stok awal (impor)', qty_change: 24, cost_price: 2900 },
      { reason: 'lainnya', note: 'Stok awal (impor)', qty_change: 25000, cost_price: 15000 },
    ]);
    expect(auditRows(h, 'product').map((r) => r.action)).toEqual(['create', 'create', 'create']);
    expect(auditRows(h, 'product_unit')).toHaveLength(4);
  });

  it('saves nothing when any row has an error', async () => {
    const res = await commit(csvFile([...VALID, 'BAD,Barang,Tidak Ada,satuan,pcs,1,pcs,1']));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({
      code: 'IMPORT_HAS_ERRORS',
      message:
        'Ada 1 baris bermasalah. Tidak ada barang yang disimpan. Perbaiki file lalu unggah ulang.',
    });
    expect(count('products')).toBe(0);
    expect(count('product_units')).toBe(0);
    expect(count('stock_movements')).toBe(0);
    expect(count("audit_logs where entity like 'product%'")).toBe(0);
  });

  it('re-checks codes at commit time: importing the same file twice is refused', async () => {
    expect((await commit(csvFile(VALID))).statusCode).toBe(201);
    const again = await commit(csvFile(VALID));
    expect(again.json().error.code).toBe('IMPORT_HAS_ERRORS');
    expect(count('products')).toBe(3);
  });

  it('imports a 500-row file', async () => {
    const rows = Array.from(
      { length: 500 },
      (_, i) =>
        `P${String(i).padStart(4, '0')},Barang ${i},${i % 2 ? 'Rokok' : 'Sembako'},satuan,pcs,${1000 + i},pcs,${1500 + i},dus,12,${17000 + i},,,,${i % 7}`,
    );
    const res = await commit(csvFile([HEADER, ...rows]));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ imported: 500 });
    expect(count('products')).toBe(500);
    expect(count('product_units')).toBe(1000);
    const mismatched = h.handle.sqlite
      .prepare(
        `select count(*) as n from products p
         where p.stock != coalesce((select sum(m.qty_change) from stock_movements m where m.product_id = p.id), 0)`,
      )
      .get() as { n: number };
    expect(mismatched.n).toBe(0);
  });

  it('imports an .xlsx file from the "Barang" sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Petunjuk').addRow(['abaikan']);
    const sheet = workbook.addWorksheet('Barang');
    sheet.addRow([...IMPORT_COLUMNS]);
    sheet.addRow(['RKK', 'Rokok Kretek', 'Rokok', 'satuan', 'bks', 20000, 'bks', 22000]);
    sheet.addRow([]);
    sheet.addRow([
      'BRS',
      'Beras',
      'Sembako',
      'curah',
      'gram',
      { formula: '12000+1', result: 12001 },
      'kg',
      13000,
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const res = await commit({ fileName: 'barang.xlsx', contentBase64: buffer.toString('base64') });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ imported: 2 });
    expect(productByCode('BRS')).toMatchObject({ cost_price: 12001, pricing_factor: 1000 });
  });
});

describe('GET products/import/template', () => {
  it('is an .xlsx with the columns in order, notes, and examples', async () => {
    const res = await api('GET', '/api/products/import/template');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="Template-Impor-Barang.xlsx"',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Barang');
    expect(sheet?.getRow(1).values).toEqual([undefined, ...IMPORT_COLUMNS]);
    expect(sheet?.getCell('A1').note).toBeTruthy();
    expect(sheet?.rowCount).toBe(1);
    const help = workbook.getWorksheet('Petunjuk');
    const text = JSON.stringify(help?.getSheetValues());
    expect(text).toContain('IDM-GRG');
    expect(text).toContain('curah');
  });

  it('round-trips: the examples copied into "Barang" import cleanly', async () => {
    const res = await api('GET', '/api/products/import/template');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const help = workbook.getWorksheet('Petunjuk') as ExcelJS.Worksheet;
    const sheet = workbook.getWorksheet('Barang') as ExcelJS.Worksheet;
    let headerRow = 0;
    help.eachRow((row, n) => {
      if (row.getCell(1).value === 'kode' && row.getCell(2).value === 'nama') headerRow = n;
    });
    for (let n = headerRow + 1; n <= help.rowCount; n++) {
      sheet.addRow((help.getRow(n).values as unknown[]).slice(1));
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const body: ImportPreviewResponse = (
      await preview({ fileName: 'template.xlsx', contentBase64: buffer.toString('base64') })
    ).json();
    expect(body.total).toBe(3);
    expect(body.invalid).toBe(0);
  });
});

describe('owner approval (menu "impor")', () => {
  it('cashiers need the owner PIN; the menu token covers template, preview, and commit', async () => {
    const { token: cashierToken } = await activeCashier(h, ownerToken);
    for (const res of [
      await api('GET', '/api/products/import/template', cashierToken),
      await preview(csvFile(VALID), cashierToken),
      await commit(csvFile(VALID), cashierToken),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
    }

    const approve = await api('POST', '/api/auth/approve', cashierToken, {
      pin: OWNER.pin,
      scope: 'impor',
    });
    expect(approve.statusCode).toBe(200);
    const token = approve.json().token;
    expect(
      (await api('GET', '/api/products/import/template', cashierToken, undefined, token))
        .statusCode,
    ).toBe(200);
    expect((await preview(csvFile(VALID), cashierToken, token)).statusCode).toBe(200);
    expect((await commit(csvFile(VALID), cashierToken, token)).statusCode).toBe(201);

    const ownerId = h.handle.sqlite.prepare('select id from users where role = ?').get('owner') as {
      id: string;
    };
    const approvedBy = h.handle.sqlite
      .prepare("select distinct approved_by from audit_logs where entity = 'product'")
      .all();
    expect(approvedBy).toEqual([{ approved_by: ownerId.id }]);

    // Another menu's token does not open Impor.
    const other = await api('POST', '/api/auth/approve', cashierToken, {
      pin: OWNER.pin,
      scope: 'laporan',
    });
    const res = await preview(csvFile(VALID), cashierToken, other.json().token);
    expect(res.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
  });

  it('requires a session', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/api/products/import/template' });
    expect(res.statusCode).toBe(401);
  });
});

describe('parsing helpers', () => {
  it('parseWholeNumber accepts digits and dot thousands only', () => {
    expect(parseWholeNumber('')).toBeUndefined();
    expect(parseWholeNumber(' 0 ')).toBe(0);
    expect(parseWholeNumber('12500')).toBe(12500);
    expect(parseWholeNumber('12.500')).toBe(12500);
    expect(parseWholeNumber('1.000.000')).toBe(1000000);
    for (const bad of ['1.5', '12,500', '-3', '1.50', 'Rp 1000', '1e3', '99999999999999999']) {
      expect(parseWholeNumber(bad)).toBeNull();
    }
  });

  it('parseCsv handles quotes, escaped quotes, CRLF, and a missing final newline', () => {
    expect(parseCsv('a,b\r\n"x,1","y ""z"""\r\nlast,')).toEqual([
      ['a', 'b'],
      ['x,1', 'y "z"'],
      ['last', ''],
    ]);
  });
});
