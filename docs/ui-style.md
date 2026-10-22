# TOKO PODOMORO — UI Style ("Teal Elegan")

Source of truth for how the web app looks. Behaviour and keyboard rules: `docs/design.md` sections 6-8 and the `cashier-ui` skill. Light theme only; dark mode is deferred.

## 1. Color tokens

CSS variables in `apps/web/src/index.css` (shadcn naming), exposed to Tailwind via `@theme inline` (`bg-primary`, `text-muted-foreground`, ...). Never hard-code hex values or Tailwind palette colors (`slate-*`, `red-*`) in components.

| Token | Value | Use |
|---|---|---|
| `--background` | `#F3F6F6` | Page background, header (no colored bar) |
| `--card`, `--popover` | `#FFFFFF` | Cards, dialogs, menus |
| `--foreground` | `#0B2422` | Body text |
| `--muted-foreground` | `#50605F` | Secondary text, labels |
| `--subtle-foreground` | `#607070` | Tertiary text: hints, captions, placeholders |
| `--faint` | `#8D9B9A` | Non-text only: decorative icons, disabled borders |
| `--border`, `--input` | `#D8E1E0` | Borders, input outlines |
| `--muted`, `--secondary` | `#EEF3F2` | Secondary buttons, tab track, hover |
| `--primary` | `#0E5E5A` | Primary action, focus border, active nav, key labels |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--primary-soft` | `#DDEDEB` | Focus halo, teal badges, active nav fill |
| `--selected` | `#EEF6F5` | Selected / newest table row |
| `--destructive` | `#B42318` | Void, cancel, negative numbers, errors (soft bg `#FDECEA`) |
| `--warning` | `#D4A72C` | Gold fill/dot/border accent; text on it is `--foreground` |
| `--warning-foreground` | `#7A5A12` | Warning text (soft bg `#FBF4E2`, border `#F1E3BD`) |
| `--success` | `#15803D` | Paid, change amount (soft bg `#EDF7F0`) |

### Meaning (never reuse a color for another meaning)

- **Teal**: only primary action, focus, active navigation, key labels. Not for status.
- **Green**: paid, change (kembalian). Not for "active" or generic success chrome; confirmations use toasts.
- **Red**: void, cancel, negative stock/amounts, errors.
- **Gold**: held sales (ditahan), kasbon, warnings, temporary PIN, PIN-gated hints.
- Anything else is neutral (foreground / muted / border).

### Contrast (WCAG AA, text >= 4.5:1)

Checked for every text token on `background`, `card`, `muted`, and `selected`:

- `foreground` >= 14.5, `muted-foreground` >= 5.9, `primary` >= 6.8, `destructive` >= 5.9, `warning-foreground` >= 5.7, white on `primary` 7.6, on `destructive` 6.6, on `success` 5.0.
- `subtle-foreground` was specified as `#6C7C7B` (4.37 on white, 3.90 on muted: fails). Darkened to `#607070` (>= 4.63). Do not use it on `primary-soft`.
- `success` text only on `card`, `background`, or its soft bg (4.58-5.02); it fails on `muted` (4.48).
- `faint` (2.9 max) and `warning` gold (2.2) are never text colors.
- `<Kbd>` tints its own text color at 10%: `muted-foreground` passes (>= 5.1), `subtle-foreground` does not (4.1). Use `muted-foreground` or `primary-foreground` text on key hints.
- Focus: `primary-soft` alone is 1.2:1 against white, so focus is a `primary` border plus a 3px `primary-soft` halo.

## 2. Typography

- **Plus Jakarta Sans** (UI) and **JetBrains Mono** (product codes, TRX numbers, usernames, key hints, recovery codes). Bundled with `@fontsource-variable/*`; never Google Fonts or a CDN (the app is offline).
- `tabular-nums` on every money and quantity (`.num` utility or `tabular-nums`). Money right-aligned in tables.
- Scale:
  - Body 15-16px (`text-[15px]` default, `text-base`).
  - Table rows 17-18px (`text-[17px]`).
  - Cashier total 52px, weight 600-700, letter-spacing `-0.03em`.
  - Labels: 11-12px uppercase, tracking `0.1em`, `muted-foreground` (`.label-caps`).
- Page titles 24-28px semibold, `-0.02em`.

## 3. Shape and depth

- Radius: cards/dialogs 22-24px (`rounded-card`), inputs/buttons 16-20px (`rounded-control`), table rows 14px (`rounded-row`), pills/badges full.
- One shadow (`shadow-card`): `0 1px 3px rgba(11,36,34,.05), 0 12px 32px -18px rgba(11,36,34,.18)`.
- Tables: no grid lines. Header is small caps text, no fill. Rows are rounded blocks that tint on hover (`muted`) and selection (`selected`).
- App header blends into `background`; no colored bars. Cards sit on `background`.

## 4. Components

- shadcn/ui, copied by hand into `apps/web/src/components/ui/` (Radix via the `radix-ui` package), restyled to these tokens. Relative imports (no `@/` alias); `cn()` in `src/lib/utils.ts`.
- Present: button, input, label, dialog, select, tabs, badge, card, table, sonner, tooltip. Add others only when a feature needs them.
- Icons: `lucide-react`, 18-20px, stroke 2; decorative icons `aria-hidden`.
- Toasts: `sonner` (`toast.success` for confirmations). Errors that block a form stay inline (`role="alert"`).
- Data tables: TanStack Table (`@tanstack/react-table`) rendered with the `table` component.
- Buttons: `default` (teal) for the one primary action per view; `secondary`, `outline`, `ghost` otherwise; `destructive` only for void/cancel/deactivate.
- Key hints: `<Kbd>` (JetBrains Mono, `muted` pill), e.g. `F8` inside the Bayar button.
- Dialogs: mark the element that should get focus on open with `data-autofocus` (Radix otherwise focuses the first focusable element); confirm dialogs use `ConfirmDialog`.

## 5. Locked layout

Target: desktop only, minimum 1366x768. Nothing may require horizontal scrolling at that size.

### Kasir (Stage 3)
- Full screen, no sidebar.
- Top bar: logo + store name, date, current user, lock icon (Ctrl+L).
- Left column:
  - Search, 60px tall, `F2` badge inside.
  - Cart table columns: no, name with `code · category` below, qty + unit, price, subtotal, remove.
  - Newest row tinted `selected` with a "BARU" badge.
- Right column, 384px:
  - Summary card: subtotal, pembulatan, TOTAL (52px).
  - Bayar button: 72px, teal, `F8`.
  - Tahan `F9` and Batal `Esc` buttons.
  - Held-sales notice (gold).
- Footer: key hints.

### Other pages
- Sidebar 232px with 8 items: Kasir `F1`, Riwayat `F6`, Barang `F3`, Stok `F4`, Pelanggan `F5`, Pemasok, Laporan, Pengaturan.
- Sidebar bottom: user card + Keluar.
- PIN-gated items show a gold "PIN" hint for cashiers.
- Sub-pages are tabs above the content (e.g. Pengaturan: Pengguna, Profil Toko, Ubah PIN; Barang: Daftar, Impor, Kategori).
- `/` opens Kasir.

### Login and lock
- Login: user tiles (`GET auth/users`: id, display name, role of active users; no usernames) + 6-digit PIN pad; the keyboard also types digits; the sixth digit submits. One user skips the tiles.
- Lock screen (Ctrl+L, idle, or the Kunci buttons): same user only, with "Ganti pengguna" (logout).
- Owner approval: the same PIN pad in a dialog ("Persetujuan pemilik"); cashiers see it when an action or PIN menu needs the owner.

### Dialogs
- Centered, dim overlay (`foreground` at 40%), `rounded-card`.
- Enter = confirm, Esc = back. Focus is trapped; the first field is autofocused.
- Bayar dialog: quick amounts "Uang pas" + the nearest notes above the total.
- Held sales: warn (gold) when prices changed since the hold.

### Other locked decisions
- Opname runs per category session (Stage 7).
- Laporan: 8 tabs, one per report endpoint (summary, categories, products, stock value, cash, debts, losses, activity). Each tab has Simpan PDF / Simpan Excel.
