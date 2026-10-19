# TOKO PODOMORO — Design Specification

Offline point-of-sale web app for Indonesian grocery stores (toko kelontong), sold commercially. Slug: `toko-podomoro`.

- UI text: Indonesian. Code, comments, commits: English.
- Roadmap and progress: `../production_checklist.md`.
- Items in section 13 are undecided; do not implement a choice without asking.

---

## 1. Product

- Runs on a single Windows PC.
- Server binds `127.0.0.1` only. Fully offline. No LAN access, no outbound network requests.
- Browser UI and API are served by one Node process on one port.

## 2. Packaging and distribution (Stage 6)

- Windows installer built with Inno Setup; bundles a portable `node.exe` (no system Node needed).
- Launcher:
  - Starts the server; prevents a duplicate server (if already running, only opens the window).
  - Opens Microsoft Edge with `--app=http://127.0.0.1:<port>`.
  - Autostarts on user login.
- Port: default `4747`, configurable in a config file. If the port is busy, show a clear Indonesian error.
- Data directory: `C:\ProgramData\TokoPodomoro\` (database, config, logs).
- Uninstall keeps the data directory.
- Manual backup (Stage 6). Auto backup and safe upgrade flow deferred (Stage 10).

## 3. Stack and architecture

| Area | Choice |
|---|---|
| Language | TypeScript |
| Runtime | Node LTS |
| Monorepo | pnpm workspaces |
| Server | `apps/server`: Fastify, better-sqlite3, Drizzle ORM, drizzle-kit |
| Web | `apps/web`: React, Vite, React Router, Tailwind |
| Shared | `packages/shared`: Zod schemas, types, money/unit math |
| PDF / Excel | pdfkit, exceljs |
| Tests | Vitest |
| Lint/format | Biome |

- Server serves the built web app and `/api` on the same port.
- Server layering: `routes -> services -> repositories`.
- Versioned SQL migrations via drizzle-kit from Stage 0.

## 4. Data rules

### 4.1 Money and quantities
- All money and quantities are integers (Rupiah; base units).
- Quantity is stored in the product base unit (pcs, gram, ml).
- `pricing_factor`: `1000` for bulk items (prices per kg / per liter), `1` for normal items.
- `products.cost_price` is the cost for `pricing_factor` base units.
- `product_units.sell_price` is the price for `factor` base units. Bulk products sell via unit `kg` / `liter` with factor `1000`.
- Line formulas:
  - `subtotal = round(qty_base * unit_price / unit_factor)`
  - `cost_total = round(qty_base * cost_price / pricing_factor)`
  - Round half up to 1 Rp, once per line.
- Sale total rounding (setting): `none` | `100` | `500`, to nearest. The difference is stored in `sales.rounding_amount`.
- MVP quantity input:
  - Bulk items: integer grams / ml.
  - Normal items: whole numbers only (sell a smaller unit instead of fractions).
- Negative stock is allowed with a warning and surfaced in reports.

### 4.2 Identity, lifecycle, time
- All ids are UUIDs.
- No hard deletes: `active` flag or void status.
- `created_at` on every table; `updated_at` on mutable tables.
- Timestamps stored in UTC. "Today" and the TRX number date use the PC's local time zone.
- Product `code` is unique across all products, including inactive ones.

### 4.3 Sales snapshots
- Sale items snapshot: product code, product name, unit name, sell price, cost price (and factors), computed `subtotal` and `cost_total`.
- Historical sales are never recomputed from current product data.

### 4.4 Stock
- `stock_movements` is the source of truth for stock.
- `products.stock` is a cache, updated in the same DB transaction as the movement.

### 4.5 Database
- SQLite with `foreign_keys = ON` and WAL journal mode.
- Every multi-table write runs in one transaction.

### 4.6 API integrity
- Client generates UUIDs for sales, purchases, and payments. Server rejects duplicates.
- Server recomputes all totals. Client numbers are never trusted.
- Error format: `{ "error": { "code": "...", "message": "..." } }`; `message` in Indonesian.

## 5. Authentication and authorization

- First-run setup creates the owner account and a one-time recovery code (hash stored in `settings`). After a recovery code is used, a new one is issued.
- Login: username + 6-digit PIN. Roles: `owner`, `cashier`.
- Sessions stored in DB (survive server restart); httpOnly cookie.
- Owner approval:
  - Owner logged in directly needs no approval token.
  - Cashier obtains owner approval by entering the owner PIN (`POST auth/approve`) -> short-lived token kept in server memory, sent as `X-Approval-Token`.
  - Action tokens (e.g. void) are single-use.
- Auto-lock after idle (`auto_lock_minutes`) and quick lock with `Ctrl+L`.
  - Lock screen unlocks only for the same user.
  - "Ganti pengguna" goes to the login page.
- No lockout on wrong PIN.
- Cashier needs owner PIN for: void, reports, user management, store settings. Everything else is open.
- All data changes are written to `audit_logs`.

## 6. Features

### 6.1 Cashier screen (Kasir)
- Full-screen layout (no sidebar).
- Search by product code or name. No product creation; unknown item shows "Barang tidak ditemukan".
- Per line: choose unit, edit quantity, remove line.
- Payment: cash and/or QRIS (QRIS recorded manually, no integration).
  - QRIS amount <= total.
  - Change is given from cash only.
- Underpayment -> kasbon confirmation dialog; must pick an existing customer or quick-add one.
- Hold sale (Tahan):
  - Stored in DB with status `held`, no TRX number, no stock reservation.
  - TRX number assigned on completion.
- Cancel sale before payment.
- Void after payment:
  - Needs owner PIN.
  - Rejected if the sale's receivable has any payments.
  - Returns stock (movements of type `void`) and voids the receivable.

### 6.2 Receipt
- After payment: prompt "Simpan nota PDF?" — `Enter` = yes, `Esc` = skip.
- Server generates the PDF (58 or 80 mm, setting) and saves it to the receipt folder (setting; default `Documents\TokoPodomoro\Nota\<TRX>.pdf`).
- Then shows "Nota tersimpan" with buttons **Buka** (open the saved file) and **Unduh** (browser download).
- Transaction detail offers both Buka and Unduh.
- Reprints marked "SALINAN"; voided sales marked "DIBATALKAN".

### 6.3 Keyboard UX
- Fully keyboard-driven. Focus always returns to search. Large fonts.
- App must capture F1-F12 (override Edge defaults).

### 6.4 Transaction history (Riwayat Transaksi)
- Defaults to today. Filters: date, text, status.
- Open to cashier.
- Save / download a receipt copy.

### 6.5 Products (Barang)
- `code`: unique (including inactive), editable.
- `name`.
- Category; defaults: Rokok, Sembako, Lain-lain. Owner can add categories.
- Type: `unit` | `bulk`.
- Base unit; cost price.
- Unit rows: name, factor, sell price; exactly one base row. Unit rows also serve as wholesale pricing.
- Deactivate, never delete.
- CSV/Excel import with downloadable template and validation preview.

### 6.6 Stock (Stok) and suppliers (Pemasok)
- Purchases from suppliers (Stok Masuk):
  - No edit. Void with owner PIN, only if there are no payments besides the initial one.
  - New cost price entered manually, with suggestions (last buy price, weighted average) and margin shown.
  - Initial paid amount creates a `supplier_payments` row + `supplier_allocations` row.
- Supplier debt payments are allocated to ticked purchases (oldest pre-ticked).
- Adjustments with reason: `rusak`, `kedaluwarsa`, `hilang`, `opname`, `lainnya`.
- Stock opname: enter physical count; system computes the delta.
- Movement history.

### 6.7 Customers and kasbon (Pelanggan)
- Name required; phone and note optional. Cashier may add customers.
- One receivable per sale.
- Customer payment (cash/QRIS) is allocated to ticked receivables:
  - Oldest receivable pre-ticked.
  - A partial amount fills the oldest selected receivable first.
  - Allocation cannot exceed the ticked total.
  - For cash, enter the amount received and show change.
- No credit limit.
- Customer ledger (Kartu Piutang) and receivables list (Daftar Piutang).

### 6.8 Reports (Laporan, owner)
- Sales and profit.
- Per category: revenue, profit, margin, share.
- Top and slow-moving products.
- Stock value.
- Negative-stock items.
- Cash vs QRIS.
- Daily cash flow = cash sales − change + cash kasbon payments − cash supplier payments. No opening balance until shifts exist.
- Receivables and payables.
- Stock losses.
- Activity log.
- Category filter on all reports.
- Export to PDF and Excel.

## 7. Pages

Sidebar layout on all pages except Kasir.

| Area | Pages / dialogs |
|---|---|
| Auth | Setup, Login, Lock, Recover PIN |
| Kasir | Kasir screen; dialogs: Bayar, Kasbon, Transaksi Ditahan, Bayar Kasbon |
| Riwayat | Riwayat Transaksi |
| Barang | Daftar, Impor, Kategori |
| Stok | Stok Masuk, Penyesuaian, Opname, Riwayat |
| Pelanggan | Daftar, Kartu Piutang, Daftar Piutang |
| Pemasok | Daftar, Kartu Hutang, Daftar Hutang |
| Laporan | Reports (owner PIN) |
| Pengaturan | Pengguna (PIN); Profil Toko, pembulatan, lebar nota, folder nota (PIN); Ubah PIN |

## 8. Keyboard shortcuts

| Key | Action |
|---|---|
| F1 | Kasir |
| F2 | Cari (focus search) |
| F3 | Barang |
| F4 | Stok |
| F5 | Pelanggan |
| F6 | Riwayat |
| F8 | Bayar |
| F9 | Tahan |
| Esc | Batal / tutup |
| Ctrl+L | Kunci |

## 9. Database tables

All tables have `id` (UUID) and `created_at`; mutable tables also have `updated_at`.

### 9.1 System
- `users`(username, name, role, pin_hash, active)
- `sessions`(user_id, token_hash, expires_at, last_seen_at)
- `settings`(key, value)
- `audit_logs`(user_id, approved_by, entity, entity_id, action, old_value, new_value)

### 9.2 Catalog
- `categories`(name, is_default, active)
- `products`(code, name, category_id, type, base_unit, pricing_factor, cost_price, stock, active)
- `product_units`(product_id, name, factor, sell_price, is_base, active)

### 9.3 Sales
- `sales`(number, cashier_id, customer_id, status, total, rounding_amount, paid_total, change_amount, debt_amount, completed_at, voided_at, voided_by, void_reason)
  - `number`: `TRX-YYYYMMDD-NNNN`, nullable while held.
  - `status`: `held` | `completed` | `voided`.
- `sale_items`(sale_id, product_id, unit_id, product_code, product_name, unit_name, qty_base, unit_factor, unit_price, cost_price, pricing_factor, subtotal, cost_total)
- `sale_payments`(sale_id, method, amount) — `method`: `cash` | `qris`

### 9.4 Customers and receivables
- `customers`(name, phone, note, active)
- `receivables`(customer_id, sale_id, amount, remaining, status) — `status`: `open` | `paid` | `void`
- `customer_payments`(customer_id, method, amount, user_id)
- `payment_allocations`(payment_id, receivable_id, amount)

### 9.5 Suppliers and purchases
- `suppliers`(name, phone, note, active)
- `purchases`(supplier_id, date, total, paid_amount, remaining, status, voided_at, voided_by, user_id, note) — `status`: `completed` | `voided`
- `purchase_items`(purchase_id, product_id, unit_id, qty_base, unit_factor, buy_price, subtotal, new_cost_price)
- `supplier_payments`(supplier_id, method, amount, user_id)
- `supplier_allocations`(payment_id, purchase_id, amount)

### 9.6 Stock
- `stock_adjustments`(product_id, qty_change, reason, note, cost_price, user_id)
- `stock_movements`(product_id, qty_change, type, ref_id, user_id) — `type`: `sale` | `void` | `purchase` | `purchase_void` | `adjustment`

### 9.7 Settings keys
- Store profile
- `rounding`: `none` | `100` | `500`
- `receipt_width`: `58` | `80`
- `receipt_folder`
- `auto_lock_minutes`
- Recovery code hash

## 10. API

Base path `/api`, JSON bodies, httpOnly session cookie. **(PIN)** = cashier needs `X-Approval-Token`.

### Setup and auth
- `GET setup/status`, `POST setup`
- `POST auth/login`, `POST auth/logout`, `POST auth/unlock`, `POST auth/approve`, `POST auth/recover`
- `GET auth/me`, `PUT auth/me/pin`

### Users (PIN)
- `GET users`, `POST users`, `PUT users/:id`

### Products and categories
- `GET products` (q, category_id, page, limit)
- `GET products/by-code/:code`, `GET products/:id`
- `POST products`, `PUT products/:id`, `PATCH products/:id/active`
- `POST products/import/preview`, `POST products/import`, `GET products/import/template`
- `GET categories`, `POST categories`, `PUT categories/:id`

### Sales
- `POST sales`
- `POST sales/held`, `GET sales/held`, `DELETE sales/held/:id`
- `GET sales` (from, to, q, status), `GET sales/:id`
- `POST sales/:id/receipt` (save PDF to receipt folder)
- `GET sales/:id/receipt.pdf` (download)
- `POST sales/:id/void` (PIN)

### Customers and kasbon
- `GET customers`, `POST customers`, `PUT customers/:id`, `GET customers/:id/ledger`
- `GET receivables`
- `POST customer-payments`

### Suppliers and stock
- `GET suppliers`, `POST suppliers`, `PUT suppliers/:id`, `GET suppliers/:id/ledger`
- `GET purchases`, `GET purchases/:id`, `POST purchases`, `POST purchases/:id/void` (PIN), `GET purchases/cost-suggestion`
- `POST supplier-payments`
- `POST stock-adjustments`, `POST stock-opname`, `GET stock-movements`

### Reports (PIN)
- `GET reports/summary`, `reports/categories`, `reports/products`, `reports/stock-value`, `reports/cash`, `reports/debts`, `reports/losses`, `reports/activity`
- `GET reports/:type/export?format=pdf|xlsx`

### Settings
- `GET settings`, `PUT settings` (PIN)

## 11. Roadmap

Tracked with checkboxes in `../production_checklist.md`.

| Stage | Scope | Done when |
|---|---|---|
| 0 Foundation | Monorepo, server serving web + /api on 127.0.0.1:4747, SQLite setup, migration framework, error format, shared math + tests | One command runs app; math tests pass |
| 1 Users | Setup, login/logout, DB sessions, roles, user mgmt, recovery code | Owner and cashier see correct menus; session survives restart |
| 2 Products | Categories, CRUD, multi-unit, bulk, search/filter, audit log, initial stock via adjustment | 100 products entered and searchable |
| 3 Cashier | Search, units, cash/QRIS, rounding, atomic save, idempotency, hold, receipt PDF (folder + download), transaction history, keyboard UX | 50 test sales, stock matches movements, receipts correct |
| 4 Kasbon | Customers, auto kasbon, payments with allocation, ledger | Balances always reconcile |
| 5 PIN & void | Approval tokens, void (stock return, receivable void), auto-lock, switch user | MVP; tag `v0.1.0-mvp` |
| 6 Distribution | Installer, portable Node, launcher, autostart, port config, manual backup | Runs on clean PC; pilot store; tag `v0.2.0-pilot` |
| 7 Stock & suppliers | Purchases, cost suggestions, supplier debt, purchase void, adjustments, opname, movement history | Stock and payables reconcile with movements/allocations |
| 8 Reports | All reports + PDF/Excel export | Totals match raw data on a seeded dataset |
| 9 Import | CSV/Excel product import (may move earlier) | 500-row file imports; invalid rows reported, none saved partially |
| 10 Deferred | See below | — |

## 12. Deferred (Stage 10)

- Safe upgrade flow: backup before migrate (required before 2nd store)
- Auto backup
- Hardware: thermal printer, barcode scanner, cash drawer
- Bulk input by weight or by amount
- Quick buttons
- Discounts with PIN
- Shifts with opening cash
- Minimum stock
- Quantity-based wholesale
- WhatsApp kasbon reminder text
- Licensing (required before wide sale)

## 13. Open questions

Not decided. Do not implement a choice without asking.

1. Can cashiers edit product data and cost prices with only the audit log as control, or does that need owner PIN?
2. Should failed PIN attempts be logged?
3. Approval token lifetime, and the scope of menu-access tokens (e.g. one Laporan visit vs. a time window).
