import os from 'node:os';
import path from 'node:path';
import {
  roundingModeSchema,
  type Settings,
  type UpdateSettingsRequest,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { insertAudit } from '../repositories/audit-repository';
import { readSettings, writeSetting } from '../repositories/settings-repository';
import type { Actor, ServiceContext } from './context';

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

const SETTING_KEYS: Record<keyof UpdateSettingsRequest, string> = {
  storeName: 'store_name',
  storeAddress: 'store_address',
  storePhone: 'store_phone',
  receiptFooter: 'receipt_footer',
  rounding: 'rounding',
  receiptWidth: 'receipt_width',
  receiptFolder: 'receipt_folder',
  autoLockMinutes: 'auto_lock_minutes',
};

/** Saves the given settings; each changed key gets an audit row (docs/design.md 4.7). */
export function updateSettings(
  ctx: ServiceContext,
  actor: Actor,
  input: UpdateSettingsRequest,
): Settings {
  return ctx.db.transaction((tx) => {
    const stored = readSettings(tx);
    for (const [field, value] of Object.entries(input) as [
      keyof UpdateSettingsRequest,
      unknown,
    ][]) {
      if (value === undefined) continue;
      const key = SETTING_KEYS[field];
      const next = String(value);
      const previous = stored.get(key) ?? null;
      if (previous === next) continue;
      writeSetting(tx, key, next);
      insertAudit(tx, {
        userId: actor.id,
        approvedBy: actor.approvedBy ?? null,
        entity: 'setting',
        entityId: key,
        action: 'update',
        oldValue: previous,
        newValue: next,
      });
    }
    return getSettings(tx);
  });
}
