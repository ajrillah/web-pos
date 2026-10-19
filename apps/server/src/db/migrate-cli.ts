import fs from 'node:fs';
import path from 'node:path';
import { DB_FILE, resolveDataDir } from '../config';
import { migrationsDir } from '../paths';
import { openDatabase } from './client';
import { runMigrations } from './migrate';

const dataDir = resolveDataDir({
  env: process.env,
  platform: process.platform,
  searchFrom: import.meta.dirname,
  cwd: process.cwd(),
});
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, DB_FILE);
const { db, sqlite } = openDatabase(file);
runMigrations(db, migrationsDir);
sqlite.close();
console.log(`Migrations applied: ${file}`);
