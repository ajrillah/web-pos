// Global function keys: docs/design.md section 8. F1-F10 are always captured so Edge's own
// actions (help, find, reload, ...) never fire. F11 and F12 are never touched.

export type ShortcutAction =
  | { kind: 'navigate'; path: string }
  | { kind: 'search' }
  | { kind: 'pay' }
  | { kind: 'hold' };

export const SHORTCUTS: Record<string, ShortcutAction> = {
  F1: { kind: 'navigate', path: '/kasir' },
  F2: { kind: 'search' },
  F3: { kind: 'navigate', path: '/barang' },
  F4: { kind: 'navigate', path: '/stok' },
  F5: { kind: 'navigate', path: '/pelanggan' },
  F6: { kind: 'navigate', path: '/riwayat' },
  F8: { kind: 'pay' },
  F9: { kind: 'hold' },
};

const CAPTURED = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']);

/**
 * F-keys whose `Alt+<number>` fallback is on. Empty until the manual Windows Edge `--app` test
 * (Stage 6 checklist) finds a key that cannot be captured; then add it here, e.g. 'F1'.
 */
export const ALT_FALLBACK_KEYS: readonly string[] = [];

interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutMatch {
  /** The browser default must be suppressed (all of F1-F10, and active Alt fallbacks). */
  capture: boolean;
  action: ShortcutAction | null;
}

/** Decides what a keydown means. Pure, so the key table is unit-tested. */
export function matchShortcut(
  event: KeyLike,
  altFallbackKeys: readonly string[] = ALT_FALLBACK_KEYS,
): ShortcutMatch {
  const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  if (CAPTURED.has(event.key)) {
    return { capture: true, action: plain ? (SHORTCUTS[event.key] ?? null) : null };
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
    const fKey = `F${event.key}`;
    if (altFallbackKeys.includes(fKey)) {
      return { capture: true, action: SHORTCUTS[fKey] ?? null };
    }
  }
  return { capture: false, action: null };
}
