import { describe, expect, it } from 'vitest';
import { matchShortcut } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('matchShortcut', () => {
  it('maps the function keys from the shortcut table', () => {
    expect(matchShortcut(key('F1')).action).toEqual({ kind: 'navigate', path: '/kasir' });
    expect(matchShortcut(key('F2')).action).toEqual({ kind: 'search' });
    expect(matchShortcut(key('F3')).action).toEqual({ kind: 'navigate', path: '/barang' });
    expect(matchShortcut(key('F6')).action).toEqual({ kind: 'navigate', path: '/riwayat' });
    expect(matchShortcut(key('F8')).action).toEqual({ kind: 'pay' });
    expect(matchShortcut(key('F9')).action).toEqual({ kind: 'hold' });
  });

  it('captures every key F1-F10, even unassigned ones, so Edge defaults never fire', () => {
    for (const k of ['F1', 'F5', 'F7', 'F10']) {
      expect(matchShortcut(key(k)).capture).toBe(true);
    }
    expect(matchShortcut(key('F7')).action).toBeNull();
    expect(matchShortcut(key('F5', { ctrlKey: true }))).toEqual({ capture: true, action: null });
  });

  it('locks the screen with Ctrl+L', () => {
    expect(matchShortcut(key('l', { ctrlKey: true }))).toEqual({
      capture: true,
      action: { kind: 'lock' },
    });
    expect(matchShortcut(key('L', { ctrlKey: true, shiftKey: true })).action).toEqual({
      kind: 'lock',
    });
    expect(matchShortcut(key('l')).capture).toBe(false);
  });

  it('never touches F11 and F12', () => {
    expect(matchShortcut(key('F11'))).toEqual({ capture: false, action: null });
    expect(matchShortcut(key('F12'))).toEqual({ capture: false, action: null });
  });

  it('uses Alt+number only for keys with the fallback switched on', () => {
    expect(matchShortcut(key('1', { altKey: true }))).toEqual({ capture: false, action: null });
    expect(matchShortcut(key('1', { altKey: true }), ['F1'])).toEqual({
      capture: true,
      action: { kind: 'navigate', path: '/kasir' },
    });
    expect(matchShortcut(key('8', { altKey: true }), ['F1']).capture).toBe(false);
  });
});
