import os from 'node:os';
import path from 'node:path';
import { roundingModeSchema, type Settings } from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { readSettings } from '../repositories/settings-repository';

// Settings keys and defaults: docs/design.md 9.7. Editing them arrives in Stage 5.

export const DEFAULT_RECEIPT_FOLDER = '%USERPROFILE%\\Documents\\TokoPodomoro\\Nota';

/**
 * Expands `%VAR%` in the receipt folder. Outside Windows (development) the Windows default
 * maps to ~/Documents/TokoPodomoro/Nota.
 */
export function resolveReceiptFolder(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32' && value === DEFAULT_RECEIPT_FOLDER) {
    return path.join(os.homedir(), 'Documents', 'TokoPodomoro', 'Nota');
  }
  return value.replace(/%([^%]+)%/g, (whole, name: string) => env[name] ?? whole);
}

export function getSettings(db: Executor): Settings {
  const raw = readSettings(db);
  const text = (key: string, fallback: string) => raw.get(key) ?? fallback;
  const rounding = roundingModeSchema.safeParse(raw.get('rounding'));
  const width = raw.get('receipt_width');
  const autoLock = Number(raw.get('auto_lock_minutes'));
  return {
    storeName: text('store_name', 'TOKO PODOMORO'),
    storeAddress: text('store_address', ''),
    storePhone: text('store_phone', ''),
    receiptFooter: text('receipt_footer', 'Terima kasih atas kunjungan Anda'),
    rounding: rounding.success ? rounding.data : 'none',
    receiptWidth: width === '80' ? '80' : '58',
    receiptFolder: resolveReceiptFolder(text('receipt_folder', DEFAULT_RECEIPT_FOLDER)),
    autoLockMinutes: Number.isInteger(autoLock) && autoLock > 0 ? autoLock : 5,
  };
}
