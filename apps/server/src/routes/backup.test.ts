import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupFileName, PRE_RESTORE_DIR } from '../services/backup-service';
import {
  activeCashier,
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
  fs.writeFileSync(path.join(h.dataDir, 'config.json'), '{\n  "port": 4848\n}\n');
});

afterEach(async () => {
  await h.close();
});

const product = (code: string) =>
  createProductAs(h, ownerToken, {
    code,
    name: `Barang ${code}`,
    category: 'Sembako',
    type: 'unit',
    baseUnit: 'pcs',
    costPrice: 1000,
    units: [{ name: 'pcs', isi: 1, sellPrice: 1500, isBase: true }],
    initialStock: 5,
  });

const codes = () =>
  (
    h.handle.sqlite.prepare('select code from products order by code').all() as { code: string }[]
  ).map((r) => r.code);

const backup = (token = ownerToken, approval?: string) =>
  h.app.inject({
    method: 'GET',
    url: '/api/backup',
    headers: { ...withSession(token), ...(approval ? { 'x-approval-token': approval } : {}) },
  });

const restore = (zip: Uint8Array, token = ownerToken) =>
  h.app.inject({
    method: 'POST',
    url: '/api/restore',
    headers: { ...withSession(token), 'content-type': 'application/zip' },
    payload: Buffer.from(zip),
  });

describe('GET /api/backup', () => {
  it('zips a consistent copy of the database, config.json, and the receipts', async () => {
    await product('A');
    fs.mkdirSync(path.join(h.receiptDir, '2026'), { recursive: true });
    fs.writeFileSync(path.join(h.receiptDir, 'TRX-20261022-0001.pdf'), 'pdf-1');
    fs.writeFileSync(path.join(h.receiptDir, '2026', 'lama.pdf'), 'pdf-2');

    const res = await backup();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="${backupFileName(h.clock.now)}"`,
    );
    const files = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(files).sort()).toEqual([
      'Nota/2026/lama.pdf',
      'Nota/TRX-20261022-0001.pdf',
      'backup.json',
      'config.json',
      'toko.db',
    ]);
    expect(new TextDecoder().decode(files['config.json'])).toContain('4848');
    expect(new TextDecoder().decode(files['Nota/TRX-20261022-0001.pdf'])).toBe('pdf-1');

    const copy = path.join(h.dataDir, 'copy.db');
    fs.writeFileSync(copy, files['toko.db'] as Uint8Array);
    const db = new Database(copy, { readonly: true });
    expect(db.prepare('select code, stock from products').all()).toEqual([{ code: 'A', stock: 5 }]);
    db.close();
    // The temporary copy is cleaned up.
    expect(fs.readdirSync(h.dataDir).filter((f) => f.startsWith('backup-'))).toEqual([]);
  });

  it('is for owners only; an owner approval does not let a cashier in', async () => {
    const { token: cashierToken } = await activeCashier(h, ownerToken);
    const approve = await h.app.inject({
      method: 'POST',
      url: '/api/auth/approve',
      headers: withSession(cashierToken),
      payload: { pin: OWNER.pin, scope: 'laporan' },
    });
    for (const res of [
      await backup(cashierToken),
      await backup(cashierToken, approve.json().token),
      await restore(new Uint8Array([1]), cashierToken),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('OWNER_ONLY');
    }
    const anonymous = await h.app.inject({ method: 'GET', url: '/api/backup' });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('POST /api/restore', () => {
  it('replaces the data after the response and restarts; the old data is kept aside', async () => {
    await product('A');
    fs.mkdirSync(h.receiptDir, { recursive: true });
    fs.writeFileSync(path.join(h.receiptDir, 'TRX-1.pdf'), 'pdf-1');
    const zip = new Uint8Array((await backup()).rawPayload);

    await product('B');
    fs.rmSync(path.join(h.receiptDir, 'TRX-1.pdf'));
    fs.writeFileSync(path.join(h.dataDir, 'config.json'), '{ "port": 4747 }\n');

    const res = await restore(zip);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ restarting: true });
    expect(h.restarts).toHaveLength(1);
    // Nothing is replaced until the server has stopped.
    expect(codes()).toEqual(['A', 'B']);

    const safety = fs.readdirSync(path.join(h.dataDir, PRE_RESTORE_DIR));
    expect(safety).toHaveLength(1);

    await h.restart(h.restarts[0]);
    expect(codes()).toEqual(['A']);
    expect(fs.readFileSync(path.join(h.dataDir, 'config.json'), 'utf8')).toContain('4848');
    expect(fs.readFileSync(path.join(h.receiptDir, 'TRX-1.pdf'), 'utf8')).toBe('pdf-1');
    expect(fs.readdirSync(h.dataDir).filter((f) => f.startsWith('restore-staging'))).toEqual([]);

    // The pre-restore copy still holds B.
    const old = new Database(path.join(h.dataDir, PRE_RESTORE_DIR, safety[0] as string), {
      readonly: true,
    });
    expect(old.prepare('select count(*) as n from products').get()).toEqual({ n: 2 });
    old.close();

    // Sessions came back with the database: the owner is still logged in.
    const me = await h.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: withSession(ownerToken),
    });
    expect(me.statusCode).toBe(200);
  });

  it('refuses invalid archives and changes nothing', async () => {
    const good = unzipSync(new Uint8Array((await backup()).rawPayload));
    const config = good['config.json'] as Uint8Array;
    const db = good['toko.db'] as Uint8Array;

    const foreign = path.join(h.dataDir, 'foreign.db');
    const other = new Database(foreign);
    other.exec('create table things (id integer)');
    other.close();

    const newer = path.join(h.dataDir, 'newer.db');
    fs.writeFileSync(newer, db);
    const newerDb = new Database(newer);
    newerDb.prepare("insert into __drizzle_migrations (hash, created_at) values ('x', 1)").run();
    newerDb.close();

    const cases: [Uint8Array, string][] = [
      [strToU8('bukan zip'), 'bukan arsip .zip'],
      [zipSync({ 'toko.db': db }), 'harus berisi toko.db dan config.json'],
      [zipSync({ 'toko.db': db, 'config.json': strToU8('{"port":"x"}') }), 'config.json'],
      [zipSync({ 'toko.db': strToU8('bukan database'), 'config.json': config }), 'Database'],
      [zipSync({ 'toko.db': fs.readFileSync(foreign), 'config.json': config }), 'bukan cadangan'],
      [
        zipSync({ 'toko.db': fs.readFileSync(newer), 'config.json': config }),
        'versi aplikasi yang lebih baru',
      ],
    ];
    for (const [zip, message] of cases) {
      const res = await restore(zip);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('RESTORE_INVALID');
      expect(res.json().error.message).toContain(message);
    }
    expect(h.restarts).toHaveLength(0);
    expect(fs.existsSync(path.join(h.dataDir, PRE_RESTORE_DIR))).toBe(false);
    expect(fs.readdirSync(h.dataDir).filter((f) => f.startsWith('restore-staging'))).toEqual([]);
  });

  it('never writes receipts outside the receipt folder', async () => {
    const good = unzipSync(new Uint8Array((await backup()).rawPayload));
    const zip = zipSync({
      'toko.db': good['toko.db'] as Uint8Array,
      'config.json': good['config.json'] as Uint8Array,
      'Nota/../../keluar.pdf': strToU8('x'),
      'Nota/ok.pdf': strToU8('ok'),
    });
    expect((await restore(zip)).statusCode).toBe(200);
    await h.restart(h.restarts[0]);
    expect(fs.existsSync(path.join(h.receiptDir, 'ok.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(h.dataDir, 'keluar.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(h.dataDir), 'keluar.pdf'))).toBe(false);
  });
});

describe('backupFileName', () => {
  it('uses the local date and time', () => {
    expect(backupFileName(new Date(2026, 0, 5, 7, 8, 9))).toBe(
      'TokoPodomoro_2026-01-05_070809.zip',
    );
  });
});
