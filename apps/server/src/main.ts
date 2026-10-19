import path from 'node:path';
import { buildApp } from './app';
import { DB_FILE, loadConfig, resolveDataDir } from './config';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { StartupError } from './errors';
import { migrationsDir, webDir } from './paths';
import { listenLocal } from './server';

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

  const app = await buildApp({ db, webDir, logger: true });
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
  app.log.info({ dataDir }, 'TOKO PODOMORO berjalan');
}

main().catch((error: unknown) => {
  if (error instanceof StartupError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
