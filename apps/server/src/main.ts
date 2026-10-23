import path from 'node:path';
import { buildApp } from './app';
import { DB_FILE, loadConfig, resolveDataDir } from './config';
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

async function main(): Promise<void> {
  const dataDir = resolveDataDir({
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
  app.log.info({ dataDir, expiredHeld }, 'TOKO PODOMORO berjalan');
}

main().catch((error: unknown) => {
  if (error instanceof StartupError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
