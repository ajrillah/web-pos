import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { invalidConfigMessage, StartupError } from './errors';

export const DATA_DIR_ENV = 'TOKO_PODOMORO_DATA_DIR';
export const CONFIG_FILE = 'config.json';
export const DB_FILE = 'toko-podomoro.db';
export const DEFAULT_PORT = 4747;

const configSchema = z.object({
  port: z.number().int().min(1).max(65_535),
});
export type AppConfig = z.infer<typeof configSchema>;

export interface DataDirContext {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  /** Directory to start searching upward from for the repo root (dev mode). */
  searchFrom: string;
  cwd: string;
}

/** Resolves the data directory per docs/design.md section 2.1. */
export function resolveDataDir({ env, platform, searchFrom, cwd }: DataDirContext): string {
  const override = env[DATA_DIR_ENV];
  if (override) {
    return path.resolve(cwd, override);
  }
  if (env.NODE_ENV === 'production' && platform === 'win32') {
    return path.win32.join(env.ProgramData ?? 'C:\\ProgramData', 'TokoPodomoro');
  }
  return path.join(findRepoRoot(searchFrom) ?? cwd, 'data');
}

function findRepoRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** Reads config.json from the data directory, creating the directory and default file if missing. */
export function loadConfig(dataDir: string): AppConfig {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    const initial: AppConfig = { port: DEFAULT_PORT };
    fs.writeFileSync(file, `${JSON.stringify(initial, null, 2)}\n`);
    return initial;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new StartupError(invalidConfigMessage(file));
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StartupError(invalidConfigMessage(file));
  }
  return parsed.data;
}
