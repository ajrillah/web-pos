---
name: cashier-ui
description: UI rules for the web app, especially the Kasir screen. Use when building pages, dialogs, keyboard handling, or displaying money in apps/web.
paths:
  - apps/web/**
---

# Cashier UI

Visual style (colors, fonts, radius, components, locked layouts): `ui-style` skill and `docs/ui-style.md`. This skill covers behaviour.

## Text
- Write all visible text in Indonesian. Keep identifiers in English.
- Show API `error.message` directly; it is already Indonesian.
- Unknown product: "Barang tidak ditemukan". Never offer product creation from Kasir.

## Money and quantity
- Format Rupiah with one shared helper: `Rp 12.345` (dot thousands, no decimals); negative `-Rp 12.345`.
- Parse money input to integers. Display server totals; never recompute them with floats.
- Bulk qty input: integer grams/ml. Normal items: whole numbers only.
- Show negative-stock warnings without blocking the sale.

## Keyboard
- Register shortcuts in one global handler: F1 Kasir, F2 Cari, F3 Barang, F4 Stok, F5 Pelanggan, F6 Riwayat, F8 Bayar, F9 Tahan, Esc batal/tutup, Ctrl+L kunci.
  - The handler is `src/keyboard/ShortcutLayer.tsx` (key table in `shortcuts.ts`). Pages register F8/F9 with `useShortcutHandlers`; F2 focuses the element marked `data-search-input`.
- Capture F1-F10 with `preventDefault()` so Edge defaults (help, reload, find) do not fire. Never bind F11/F12.
- Wire `Alt+<number>` fallbacks only for keys that fail the manual Windows capture test (Stage 6; see `docs/design.md` section 8).
- Esc closes the topmost dialog; with no dialog in Kasir, it cancels the current action.
- Every dialog: autofocus primary field (`data-autofocus` on a button), Enter confirms, Esc cancels, focus trapped. In Kasir, `onCloseAutoFocus` returns focus to the search box.
- "Simpan nota PDF?": Enter = save, Esc = skip. Then "Nota tersimpan" with Buka, Buka folder, Unduh.
- Resuming a held sale: show refreshed prices; notify which deactivated items were removed.
- After every action (add, remove, pay, hold, close dialog, error) return focus to the Kasir search input.
- Everything reachable without a mouse.

## Layout
- Kasir is full-screen; all other pages use the sidebar layout.
- Kasir sizes and layout are locked in `docs/ui-style.md` section 5 (60px search, 52px total, 72px Bayar). Text contrast >= 4.5:1; no hover-only controls.
- Hide owner-only menus from cashier; PIN actions open the owner PIN dialog.
- Lock screen unlocks only the same user; "Ganti pengguna" navigates to login.

## Offline
- Bundle all assets, fonts (`@fontsource-variable/*`), and icons (`lucide-react`) locally. No CDN links, no external fonts.
