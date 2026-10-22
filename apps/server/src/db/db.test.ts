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
});
