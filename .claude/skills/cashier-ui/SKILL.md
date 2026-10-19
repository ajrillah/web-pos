---
name: cashier-ui
description: UI rules for the web app, especially the Kasir screen. Use when building pages, dialogs, keyboard handling, or displaying money in apps/web.
paths:
  - apps/web/**
---

# Cashier UI

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
- Capture F1-F10 with `preventDefault()` so Edge defaults (help, reload, find) do not fire. Never bind F11/F12.
- Wire `Alt+<number>` fallbacks only for keys that fail the Stage 3 Windows capture test (see `docs/design.md` section 8).
- Esc closes the topmost dialog; with no dialog in Kasir, it cancels the current action.
- Every dialog: autofocus primary field, Enter confirms, Esc cancels, focus trapped.
- "Simpan nota PDF?": Enter = save, Esc = skip. Then "Nota tersimpan" with Buka, Buka folder, Unduh.
- Resuming a held sale: show refreshed prices; notify which deactivated items were removed.
- After every action (add, remove, pay, hold, close dialog, error) return focus to the Kasir search input.
- Everything reachable without a mouse.

## Layout
- Kasir is full-screen; all other pages use the sidebar layout.
- Large fonts on Kasir: search and totals at least `text-2xl`, grand total larger. High contrast; no hover-only controls.
- Hide owner-only menus from cashier; PIN actions open the owner PIN dialog.
- Lock screen unlocks only the same user; "Ganti pengguna" navigates to login.

## Offline
- Bundle all assets, fonts, and icons locally. No CDN links, no external fonts.
