import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** The database or a transaction; repositories accept either. */
export type Executor = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: Database.Database;
}

/** Opens the SQLite file (or ':memory:') with foreign keys on and WAL journaling. */
export function openDatabase(file: string): DatabaseHandle {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { db: drizzle(sqlite, { schema }), sqlite };
}
