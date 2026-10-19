import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE, DATA_DIR_ENV, loadConfig, resolveDataDir } from './config';
import { StartupError } from './errors';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toko-config-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('resolveDataDir', () => {
  const base = { platform: 'linux' as const, searchFrom: import.meta.dirname, cwd: '/work' };

  it('prefers the env override, resolved against cwd', () => {
    expect(resolveDataDir({ ...base, env: { [DATA_DIR_ENV]: 'custom' } })).toBe(
      path.resolve('/work', 'custom'),
    );
  });

  it('uses ProgramData in production on Windows', () => {
    expect(resolveDataDir({ ...base, platform: 'win32', env: { NODE_ENV: 'production' } })).toBe(
      'C:\\ProgramData\\TokoPodomoro',
    );
  });

  it('uses <repo>/data in development', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    expect(resolveDataDir({ ...base, env: {} })).toBe(path.join(repoRoot, 'data'));
  });

  it('does not use ProgramData outside Windows', () => {
    expect(resolveDataDir({ ...base, env: { NODE_ENV: 'production' } })).not.toContain(
      'ProgramData',
    );
  });

  it('falls back to cwd/data when no repo root is found', () => {
    expect(resolveDataDir({ ...base, searchFrom: tmp, cwd: tmp, env: {} })).toBe(
      path.join(tmp, 'data'),
    );
  });
});

describe('loadConfig', () => {
  it('creates the data dir and a default config.json', () => {
    const dataDir = path.join(tmp, 'nested', 'data');
    expect(loadConfig(dataDir)).toEqual({ port: 4747 });
    const written = JSON.parse(fs.readFileSync(path.join(dataDir, CONFIG_FILE), 'utf8'));
    expect(written).toEqual({ port: 4747 });
  });

  it('reads an existing config', () => {
    fs.writeFileSync(path.join(tmp, CONFIG_FILE), JSON.stringify({ port: 5000 }));
    expect(loadConfig(tmp)).toEqual({ port: 5000 });
  });

  it('rejects malformed JSON with an Indonesian message', () => {
    fs.writeFileSync(path.join(tmp, CONFIG_FILE), '{ port: ');
    expect(() => loadConfig(tmp)).toThrow(StartupError);
    expect(() => loadConfig(tmp)).toThrow(/File konfigurasi tidak valid/);
  });

  it('rejects an out-of-range port', () => {
    fs.writeFileSync(path.join(tmp, CONFIG_FILE), JSON.stringify({ port: 70_000 }));
    expect(() => loadConfig(tmp)).toThrow(StartupError);
  });
});
