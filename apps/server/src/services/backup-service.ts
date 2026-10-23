import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import { CONFIG_FILE, configSchema, DB_FILE } from '../config';
import { AppError } from '../errors';
import { appVersion } from '../version';
import type { ServiceContext } from './context';
import { DEFAULT_RECEIPT_FOLDER, getSettings, resolveReceiptFolder } from './settings-service';

// Manual backup and restore (docs/design.md 11.4). Owner only.

/** Zip entries. The database is stored as `toko.db` whatever its file name on disk. */
export const BACKUP_DB_ENTRY = 'toko.db';
export const BACKUP_CONFIG_ENTRY = 'config.json';
export const BACKUP_INFO_ENTRY = 'backup.json';
/** Receipt PDFs live under this folder in the zip. */
export const BACKUP_RECEIPTS_DIR = 'Nota/';
/** Where the current database is copied before a restore replaces it. */
export const PRE_RESTORE_DIR = 'cadangan-sebelum-pulihkan';

const STAGED_DB = 'restore-staging.db';
const STAGED_CONFIG = 'restore-staging.json';

/** Paths and the live SQLite handle; main.ts and the test harness provide them. */
export interface SystemContext {
  dataDir: string;
  sqlite: Database.Database;
  migrationsDir: string;
  /**
   * Stops the server, runs `apply` (replaces the files), and starts a fresh server process.
   * Called after the restore response has been sent.
   */
  restart: (apply: () => void) => void;
}

const restoreInvalid = (message: string) => new AppError(400, 'RESTORE_INVALID', message);

const pad = (n: number) => String(n).padStart(2, '0');

/** `TokoPodomoro_YYYY-MM-DD_HHmmss.zip` in the PC's local time. */
export function backupFileName(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `TokoPodomoro_${date}_${time}.zip`;
}

function stamp(now: Date): string {
  return backupFileName(now).replace(/^TokoPodomoro_|\.zip$/g, '');
}

/** Files under `dir`, as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    );
}

/**
 * A consistent copy of the database (SQLite online backup, safe while the app runs), the config
 * file, and the receipt folder, zipped.
 */
export async function createBackup(
  ctx: ServiceContext,
  system: SystemContext,
): Promise<{ fileName: string; body: Buffer }> {
  const now = ctx.now();
  const tmp = path.join(system.dataDir, `backup-${process.pid}-${now.getTime()}.db`);
  try {
    await system.sqlite.backup(tmp);
    const configFile = path.join(system.dataDir, CONFIG_FILE);
    const files: Zippable = {
      [BACKUP_DB_ENTRY]: fs.readFileSync(tmp),
      [BACKUP_CONFIG_ENTRY]: fs.existsSync(configFile)
        ? fs.readFileSync(configFile)
        : strToU8(`${JSON.stringify({ port: 4747 }, null, 2)}\n`),
      [BACKUP_INFO_ENTRY]: strToU8(
        JSON.stringify({ app: 'TOKO PODOMORO', version: appVersion, createdAt: now.toISOString() }),
      ),
    };
    const receipts = getSettings(ctx.db).receiptFolder;
    for (const file of listFiles(receipts)) {
      // PDFs barely compress; store them as is.
      files[`${BACKUP_RECEIPTS_DIR}${file}`] = [
        fs.readFileSync(path.join(receipts, file)),
        { level: 0 },
      ];
    }
    return { fileName: backupFileName(now), body: Buffer.from(zipSync(files, { level: 6 })) };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function migrationCount(migrationsDir: string): number {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  return journal.entries.length;
}

/** Checks the staged database: readable SQLite, intact, this app's, not from a newer version. */
function checkDatabase(file: string, migrationsDir: string): string {
  let db: Database.Database;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw restoreInvalid('Database di dalam cadangan tidak dapat dibuka.');
  }
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw restoreInvalid('Database di dalam cadangan rusak.');
    }
    const tables = new Set(
      (
        db.prepare("select name from sqlite_master where type = 'table'").all() as {
          name: string;
        }[]
      ).map((t) => t.name),
    );
    if (!tables.has('users') || !tables.has('__drizzle_migrations')) {
      throw restoreInvalid('File ini bukan cadangan TOKO PODOMORO.');
    }
    const applied = (
      db.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number }
    ).n;
    if (applied > migrationCount(migrationsDir)) {
      throw restoreInvalid(
        'Cadangan ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi terlebih dahulu.',
      );
    }
    const folder = db.prepare("select value from settings where key = 'receipt_folder'").get() as
      | { value: string }
      | undefined;
    return resolveReceiptFolder(folder?.value ?? DEFAULT_RECEIPT_FOLDER);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw restoreInvalid('Database di dalam cadangan rusak.');
  } finally {
    db.close();
    // Opening a WAL database leaves empty -wal / -shm files next to it.
    for (const suffix of ['-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  }
}

/** Receipt entries as safe relative paths (no `..`, no absolute paths). */
function receiptEntries(entries: Record<string, Uint8Array>): [string, Uint8Array][] {
  return Object.entries(entries).flatMap(([name, data]) => {
    if (!name.startsWith(BACKUP_RECEIPTS_DIR) || name.endsWith('/')) return [];
    const relative = name.slice(BACKUP_RECEIPTS_DIR.length);
    const parts = relative.split('/');
    if (
      relative === '' ||
      parts.some((p) => p === '' || p === '.' || p === '..' || p.includes('\\'))
    ) {
      return [];
    }
    return [[parts.join(path.sep), data]];
  });
}

/**
 * Validates the uploaded zip and stages its files in the data directory; copies the current
 * database aside. Returns the step that replaces the live files, to run once the server stopped.
 */
export async function prepareRestore(
  ctx: ServiceContext,
  system: SystemContext,
  zip: Buffer,
): Promise<{ apply: () => void; safetyCopy: string }> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zip));
  } catch {
    throw restoreInvalid('File bukan arsip .zip yang valid.');
  }
  const dbData = entries[BACKUP_DB_ENTRY];
  const configData = entries[BACKUP_CONFIG_ENTRY];
  if (!dbData || !configData) {
    throw restoreInvalid(
      `Arsip harus berisi ${BACKUP_DB_ENTRY} dan ${BACKUP_CONFIG_ENTRY}. Gunakan file cadangan dari menu Cadangkan Data.`,
    );
  }
  let config: unknown;
  try {
    config = JSON.parse(new TextDecoder().decode(configData));
  } catch {
    config = null;
  }
  if (!configSchema.safeParse(config).success) {
    throw restoreInvalid(`${BACKUP_CONFIG_ENTRY} di dalam cadangan tidak valid.`);
  }

  const stagedDb = path.join(system.dataDir, STAGED_DB);
  const stagedConfig = path.join(system.dataDir, STAGED_CONFIG);
  fs.writeFileSync(stagedDb, dbData);
  let receiptFolder: string;
  try {
    receiptFolder = checkDatabase(stagedDb, system.migrationsDir);
  } catch (error) {
    fs.rmSync(stagedDb, { force: true });
    throw error;
  }
  fs.writeFileSync(stagedConfig, configData);

  // The current data, in case the owner restored the wrong file.
  const safetyDir = path.join(system.dataDir, PRE_RESTORE_DIR);
  fs.mkdirSync(safetyDir, { recursive: true });
  const safetyCopy = path.join(safetyDir, `toko-podomoro_${stamp(ctx.now())}.db`);
  await system.sqlite.backup(safetyCopy);

  const receipts = receiptEntries(entries);
  const dataDir = system.dataDir;
  const apply = () => {
    const live = path.join(dataDir, DB_FILE);
    for (const suffix of ['-wal', '-shm']) fs.rmSync(`${live}${suffix}`, { force: true });
    fs.renameSync(stagedDb, live);
    fs.renameSync(stagedConfig, path.join(dataDir, CONFIG_FILE));
    // Receipts are added back; files already in the folder are kept.
    for (const [relative, data] of receipts) {
      const target = path.join(receiptFolder, relative);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
  };
  return { apply, safetyCopy };
}
