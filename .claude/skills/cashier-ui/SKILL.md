---
name: cashier-ui
description: UI rules for the web app, especially the Kasir screen. Use when building pages, dialogs, keyboard handling, or displaying money in apps/web.
paths:
  - apps/web/**
---

# Cashier UI

## Text
- Write all visible text in Indonesian. Keep code identifiers in English.
- Show API `error.message` directly; it is already Indonesian.
- Unknown product search result: "Barang tidak ditemukan". Never offer product creation from Kasir.

## Money
- Format Rupiah with one shared helper: `Rp 12.345` (dot thousands separator, no decimals). Negative: `-Rp 12.345`.
- Parse user money input to integers only. Never display server values recomputed with floats.
- Show quantities in the chosen unit; send integers in base unit.

## Keyboard
- Register global shortcuts in one place: F1 Kasir, F2 Cari, F3 Barang, F4 Stok, F5 Pelanggan, F6 Riwayat, F8 Bayar, F9 Tahan, Esc batal/tutup, Ctrl+L kunci.
- Call `preventDefault()` on handled function keys (F1, F3, F5, F6 have browser defaults).
- Esc closes the topmost dialog; with no dialog in Kasir, it cancels the current action.
- Every dialog: autofocus its primary field, Enter confirms, Esc cancels, trap focus inside.
- After every action (add line, remove, pay, hold, close dialog, error), return focus to the Kasir search input.
- Everything must be reachable without a mouse.

## Layout
- Kasir is full-screen without sidebar; all other pages use the sidebar layout.
- Use large fonts on Kasir (totals and search at least `text-2xl`; grand total larger).
- High contrast; no hover-only controls.
- Hide owner-only menus from cashier; PIN-protected actions open the owner PIN dialog.

## Offline
- Bundle all assets, fonts, and icons locally. No CDN links, no external fonts.
