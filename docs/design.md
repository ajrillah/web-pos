# Design Specification

Offline point-of-sale web app for Indonesian grocery stores (toko kelontong), sold commercially.

- UI text: Indonesian. Code, comments, commits: English.
- Roadmap and progress tracking: `../production_checklist.md`.

---

## 1. Product

- Runs on a single Windows PC.
- Server binds `127.0.0.1` only. Fully offline. No LAN access, no external network requests.
- The browser UI and the API are served by one Node process on one port.

## 2. Packaging and distribution (Stage 6)

- Windows installer built with Inno Setup.
- Bundles a portable `node.exe`; no system Node install required.
- Launcher:
  - Starts the server.
  - Prevents a duplicate server (if already running, only opens the window).
  - Opens Microsoft Edge with `--app=http://127.0.0.1:<port>`.
  - Autostarts on user login.
- Database location: `C:\ProgramData\<AppName>\`.
- Uninstall keeps the data directory.
- Manual backup (Stage 6); auto backup deferred (Stage 10).

## 3. Stack and architecture

| Area | Choice |
|---|---|
| Language | TypeScript |
| Runtime | Node LTS |
| Monorepo | pnpm workspaces |
| Server | `apps/server`: Fastify, better-sqlite3, Drizzle ORM, drizzle-kit |
| Web | `apps/web`: React, Vite, React Router, Tailwind |
| Shared | `packages/shared`: Zod schemas, types, money/unit math |
| Tests | Vitest |
| Lint/format | Biome |

- Server serves the built web app and `/api` on the same port.
- Server layering: `routes -> services -> repositories`.
- Versioned SQL migrations via drizzle-kit from Stage 0.

## 4. Data rules

### 4.1 Money and quantities
- All money and quantities are integers.
- Quantity is stored in the product base unit (pcs, gram, ml).
- `pricing_factor`: bulk items = 1000 (price per kg / per liter); normal items = 1.
- Line subtotal = `round(qty_base * unit_price / unit_factor)`.
- Rounding happens once per line. The rounding rule is a setting.

### 4.2 Identity and lifecycle
- All ids are UUIDs.
- No hard deletes. Use an `active` flag or a `voided` status.
- `created_at` on every table.

### 4.3 Sales snapshots
- Sale items snapshot: product code, product name, unit name, sell price, cost price, computed subtotal, cost_total.

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

- First-run setup creates the owner account and shows a one-time recovery code.
- Login: username + PIN.
- Roles: `owner`, `cashier`.
- Owner PIN approval (`POST /api/auth/approve`) returns a short-lived token sent as header `X-Approval-Token`.
- Auto-lock after idle (minutes is a setting) and quick lock with `Ctrl+L`.
- No lockout on wrong PIN.
- PIN reset via recovery code.
- Cashier needs owner PIN approval for:
  - Void
  - Reports
  - User management
  - Store settings
- Everything else is open to cashier.
- All data changes are written to `audit_logs`.

## 6. Features

### 6.1 Cashier screen (Kasir)
- Full-screen layout (no sidebar).
- Search by product code or name. No product creation here; unknown item shows "Barang tidak ditemukan".
- Per line: choose unit, edit quantity, remove line.
- Payment methods: cash and/or QRIS.
  - QRIS amount <= total.
  - Change is given from cash only.
- Underpayment opens a kasbon confirmation dialog; user must pick an existing customer or quick-add one.
- Hold sale (Tahan) and resume later.
- Cancel sale before payment.
- Void after payment requires owner PIN; rejected if the sale's receivable has any payments.
- After payment: prompt "Simpan nota PDF?" — `Enter` = yes, `Esc` = skip.
- Receipt PDF:
  - Width 58 mm or 80 mm (setting).
  - Generated server-side.
  - Reprints marked "SALINAN".
  - Voided sales marked "DIBATALKAN".
- Fully keyboard-driven. Focus always returns to search. Large fonts.

### 6.2 Transaction history (Riwayat Transaksi)
- Defaults to today.
- Filters: date range, text, status.
- Open to cashier.
- Save a receipt copy (marked "SALINAN").

### 6.3 Products (Barang)
- `code`: unique, editable.
- `name`.
- Category; defaults: Rokok, Sembako, Lain-lain. Owner can add categories.
- Type: `unit` | `bulk`.
- Base unit.
- Cost price.
- Unit rows: name, factor, sell price; exactly one base unit row. Unit rows also serve as wholesale pricing.
- Deactivate, never delete.
- CSV/Excel import with downloadable template and validation preview before commit.

### 6.4 Stock (Stok)
- Purchases from suppliers (Stok Masuk).
  - New cost price entered manually, with suggestions: last buy price and weighted average; margin shown.
- Supplier debt with installments, allocated to chosen purchases.
- Adjustments with reason: `rusak`, `kedaluwarsa`, `hilang`, `opname`, `lainnya`.
- Stock opname: enter physical count; system computes the delta.
- Movement history.

### 6.5 Customers and kasbon (Pelanggan)
- Name required; phone and note optional. Cashier may add customers.
- One receivable per sale.
- Customer payment (cash/QRIS) is allocated to receivables the user ticks.
  - Oldest receivable is pre-ticked.
  - A partial amount fills the oldest selected receivable first.
- No credit limit.
- Customer ledger (Kartu Piutang) and receivables list (Daftar Piutang).

### 6.6 Reports (Laporan, owner PIN)
- Sales and profit.
- Per category: revenue, profit, margin, share.
- Top and slow-moving products.
- Stock value.
- Cash vs QRIS and expected cash.
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
| Pengaturan | Pengguna (PIN), Profil Toko / pembulatan / lebar nota (PIN), Ubah PIN |

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

All tables additionally have `id` (UUID) and `created_at`.

### 9.1 System
- `users`(username, name, role, pin_hash, active)
- `settings`(key, value)
- `audit_logs`(user_id, approved_by, entity, entity_id, action, old_value, new_value)

### 9.2 Catalog
- `categories`(name, is_default, active)
- `products`(code, name, category_id, type, base_unit, pricing_factor, cost_price, stock, active)
- `product_units`(product_id, name, factor, sell_price, is_base, active)

### 9.3 Sales
- `sales`(number, cashier_id, customer_id, status, total, paid_total, change_amount, debt_amount, completed_at, voided_at, voided_by, void_reason)
  - `number` format: `TRX-YYYYMMDD-NNNN`
  - `status`: `held` | `completed` | `voided`
- `sale_items`(sale_id, product_id, unit_id, product_code, product_name, unit_name, qty_base, unit_factor, unit_price, cost_price, pricing_factor, subtotal, cost_total)
- `sale_payments`(sale_id, method, amount) — `method`: `cash` | `qris`

### 9.4 Customers and receivables
- `customers`(name, phone, note, active)
- `receivables`(customer_id, sale_id, amount, remaining, status)
- `customer_payments`(customer_id, method, amount, user_id)
- `payment_allocations`(payment_id, receivable_id, amount)

### 9.5 Suppliers and purchases
- `suppliers`(name, phone, note, active)
- `purchases`(supplier_id, date, total, paid_amount, remaining, user_id, note)
- `purchase_items`(purchase_id, product_id, unit_id, qty_base, unit_factor, buy_price, subtotal, new_cost_price)
- `supplier_payments`(supplier_id, method, amount, user_id)
- `supplier_allocations`(payment_id, purchase_id, amount)

### 9.6 Stock
- `stock_adjustments`(product_id, qty_change, reason, note, cost_price, user_id)
- `stock_movements`(product_id, qty_change, type, ref_id, user_id) — `type`: `sale` | `void` | `purchase` | `adjustment`

### 9.7 Settings keys
- `receipt_width`: `58` | `80`
- Rounding rule
- Store profile
- Auto-lock minutes

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
- `GET products/by-code/:code`
- `GET products/:id`
- `POST products`, `PUT products/:id`, `PATCH products/:id/active`
- `POST products/import/preview`, `POST products/import`, `GET products/import/template`
- `GET categories`, `POST categories`, `PUT categories/:id`

### Sales
- `POST sales`
- `POST sales/held`, `GET sales/held`, `DELETE sales/held/:id`
- `GET sales` (from, to, q, status)
- `GET sales/:id`
- `GET sales/:id/receipt.pdf`
- `POST sales/:id/void` (PIN)

### Customers and kasbon
- `GET customers`, `POST customers`, `PUT customers/:id`, `GET customers/:id/ledger`
- `GET receivables`
- `POST customer-payments`

### Suppliers and stock
- `GET suppliers`, `POST suppliers`, `PUT suppliers/:id`, `GET suppliers/:id/ledger`
- `GET purchases`, `GET purchases/:id`, `POST purchases`, `GET purchases/cost-suggestion`
- `POST supplier-payments`
- `POST stock-adjustments`
- `POST stock-opname`
- `GET stock-movements`

### Reports (PIN)
- `GET reports/summary`, `reports/categories`, `reports/products`, `reports/stock-value`, `reports/cash`, `reports/debts`, `reports/losses`, `reports/activity`
- `GET reports/:type/export?format=pdf|xlsx`

### Settings
- `GET settings`, `PUT settings` (PIN)

## 11. Roadmap

Tracked with checkboxes in `../production_checklist.md`.

| Stage | Scope | Done when |
|---|---|---|
| 0 Foundation | Monorepo, server serving web + /api on 127.0.0.1, SQLite setup, migration framework, error format, shared math + tests | One command runs app; math tests pass |
| 1 Users | Setup, login/logout, roles, user management | Owner and cashier see correct menus |
| 2 Products | Categories, CRUD, multi-unit, bulk, search/filter, audit log, initial stock via adjustment | 100 products entered and searchable |
| 3 Cashier | Search, units, cash/QRIS, atomic save, idempotency, hold, receipt PDF, transaction history, keyboard UX | 50 test sales, stock matches movements, receipts correct |
| 4 Kasbon | Customers, auto kasbon, payments with allocation, ledger | Balances always reconcile |
| 5 PIN & void | Approval token, void (stock return, receivable cancel), auto-lock, recovery | MVP; tag `v0.1.0-mvp` |
| 6 Distribution | Installer, portable Node, launcher, autostart, manual backup | Runs on clean PC; pilot store; tag `v0.2.0-pilot` |
| 7 Stock & suppliers | Purchases, cost suggestions, supplier debt, adjustments, opname, movement history | — |
| 8 Reports | All reports + PDF/Excel export | — |
| 9 Import | CSV/Excel product import (may move earlier) | — |
| 10 Deferred | See below | — |

Stage 10 (deferred):
- Migrations in production use (required before 2nd store)
- Auto backup
- Hardware: thermal printer, barcode scanner, cash drawer
- Bulk input by weight or by amount
- Quick buttons
- Discounts with PIN
- Shifts
- Minimum stock
- Quantity-based wholesale
- WhatsApp kasbon reminder text
- Licensing (required before wide sale)

## 12. Open questions

Not decided. Do not implement a choice without asking.

1. Should cashiers be allowed to edit product data, with only the audit log as control, or should edits need owner PIN?
2. Should failed PIN attempts be logged?
3. What is the approval token lifetime?
