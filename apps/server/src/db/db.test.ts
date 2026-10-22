import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationsDir } from '../paths';
import { type DatabaseHandle, openDatabase } from './client';
import { runMigrations } from './migrate';
import { categories, settings } from './schema';

let tmp: string;
let handle: DatabaseHandle;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toko-db-'));
  handle = openDatabase(path.join(tmp, 'test.db'));
});

afterEach(() => {
  handle.sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('enables WAL and foreign keys', () => {
    expect(handle.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('runMigrations', () => {
  it('creates tables and can run again without changes', () => {
    runMigrations(handle.db, migrationsDir);
    runMigrations(handle.db, migrationsDir);
    const tables = handle.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name = 'settings'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('fills id and UTC timestamps by default', () => {
    runMigrations(handle.db, migrationsDir);
    handle.db.insert(settings).values({ key: 'rounding', value: 'none' }).run();
    const row = handle.db.select().from(settings).where(eq(settings.key, 'rounding')).get();
    const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.createdAt).toMatch(isoUtc);
    expect(row?.updatedAt).toMatch(isoUtc);
  });

  it('seeds the default categories with ISO timestamps', () => {
    runMigrations(handle.db, migrationsDir);
    const rows = handle.db.select().from(categories).all();
    expect(rows.map((r) => [r.name, r.isDefault, r.active])).toEqual([
      ['Rokok', true, true],
      ['Sembako', true, true],
      ['Lain-lain', true, true],
    ]);
    expect(rows[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('keeps product codes unique ignoring case', () => {
    runMigrations(handle.db, migrationsDir);
    const insert = handle.sqlite.prepare(
      `insert into products (id, code, name, category_id, type, base_unit, pricing_factor, cost_price, created_at, updated_at)
       values (?, ?, 'x', '5b0c3c1e-8f0e-4c55-9d1a-0c6f2f8a0003', 'unit', 'pcs', 1, 0, 't', 't')`,
    );
    insert.run('a', 'abc-1');
    expect(() => insert.run('b', 'ABC-1')).toThrow(/UNIQUE/);
  });

  it('backfills sale line categories from the product when adding the snapshot (0008)', () => {
    // Apply migrations up to 0007, record a sale line, then apply the rest.
    const before = path.join(tmp, 'drizzle-0007');
    fs.cpSync(migrationsDir, before, { recursive: true });
    const journalFile = path.join(before, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 7);
    fs.writeFileSync(journalFile, JSON.stringify(journal));
    runMigrations(handle.db, before);

    const sembako = '5b0c3c1e-8f0e-4c55-9d1a-0c6f2f8a0002';
    const run = (statement: string) => handle.sqlite.prepare(statement).run();
    run(`insert into users (id, username, name, role, pin_hash, created_at, updated_at)
         values ('u', 'pemilik', 'Bu Sari', 'owner', 'x', 't', 't')`);
    run(`insert into products (id, code, name, category_id, type, base_unit, pricing_factor, cost_price, created_at, updated_at)
         values ('p', 'IDM', 'Indomie', '${sembako}', 'unit', 'pcs', 1, 2500, 't', 't')`);
    run(`insert into product_units (id, product_id, name, factor, sell_price, is_base, created_at, updated_at)
         values ('pu', 'p', 'pcs', 1, 3500, 1, 't', 't')`);
    run(`insert into sales (id, number, cashier_id, status, total, rounding_amount, created_at, updated_at)
         values ('s', 'TRX-20261020-0001', 'u', 'completed', 3500, 0, 't', 't')`);
    run(`insert into sale_items (id, sale_id, line_no, product_id, unit_id, product_code, product_name, unit_name,
           qty_base, unit_factor, unit_price, cost_price, pricing_factor, subtotal, cost_total, created_at)
         values ('i', 's', 1, 'p', 'pu', 'IDM', 'Indomie', 'pcs', 1, 1, 3500, 2500, 1, 3500, 2500, 't')`);

    runMigrations(handle.db, migrationsDir);
    expect(
      handle.sqlite.prepare('select category_id, category_name from sale_items').get(),
    ).toEqual({ category_id: sembako, category_name: 'Sembako' });
  });
});
