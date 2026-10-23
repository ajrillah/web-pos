import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';

/**
 * Restarts after a restore: closes the server (and with it the database), runs `apply` to
 * replace the files, starts a detached copy of this process with the same arguments, and exits.
 * The new process opens the restored database and runs any pending migrations.
 */
export async function restartServer(app: FastifyInstance, apply: () => void): Promise<void> {
  try {
    await app.close();
    apply();
  } catch (error) {
    app.log.error(error, 'Pemulihan data gagal');
  }
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  process.exit(0);
}
