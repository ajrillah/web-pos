import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app';
import { DB_FILE, loadConfig, resolveDataDir, STARTUP_ERROR_FILE } from './config';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { StartupError } from './errors';
import { migrationsDir, webDir } from './paths';
import { ApprovalStore } from './security/approvals';
import { listenLocal } from './server';
import type { SystemContext } from './services/backup-service';
import { deleteExpiredHeldSales } from './services/sale-service';
import { openWithSystem } from './system/open-path';
import { restartServer } from './system/restart';

// Known once resolved; a startup failure is reported there for the launcher.
let dataDir: string | undefined;

async function main(): Promise<void> {
  dataDir = resolveDataDir({
    env: process.env,
    platform: process.platform,
    searchFrom: import.meta.dirname,
    cwd: process.cwd(),
  });
  const config = loadConfig(dataDir);
  const { db, sqlite } = openDatabase(path.join(dataDir, DB_FILE));
  runMigrations(db, migrationsDir);
  const now = () => new Date();
  const expiredHeld = deleteExpiredHeldSales({
    db,
    now,
    openPath: openWithSystem,
    approvals: new ApprovalStore(now),
  });

  const system: SystemContext = {
    dataDir,
    sqlite,
    migrationsDir,
    restart: (apply) => void restartServer(app, apply),
  };
  const app = await buildApp({ db, webDir, logger: true, system });
  app.addHook('onClose', async () => {
    sqlite.close();
  });

  const shutdown = () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await listenLocal(app, config.port);
  } catch (error) {
    await app.close();
    throw error;
  }
  fs.rmSync(path.join(dataDir, STARTUP_ERROR_FILE), { force: true });
  app.log.info({ dataDir, expiredHeld }, 'TOKO PODOMORO berjalan');
}

main().catch((error: unknown) => {
  const message =
    error instanceof StartupError
      ? error.message
      : `TOKO PODOMORO gagal dimulai: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error instanceof StartupError ? message : error);
  if (dataDir) {
    try {
      fs.writeFileSync(path.join(dataDir, STARTUP_ERROR_FILE), `${message}\n`);
    } catch {
      // The data directory itself may be the problem; the console message remains.
    }
  }
  process.exit(1);
});
