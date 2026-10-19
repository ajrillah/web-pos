import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { AppDatabase } from './client';

/** Applies pending drizzle-kit migrations. Safe to call on every start. */
export function runMigrations(db: AppDatabase, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}
