import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationsDir } from '../paths';
import { type DatabaseHandle, openDatabase } from './client';
import { runMigrations } from './migrate';
import { settings } from './schema';

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
});
