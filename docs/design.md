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
- The server runs under the logged-in Windows user, started by the launcher (not a Windows service).
- Launcher:
  - Starts the server; prevents a duplicate server (if already running, only opens the window).
  - Opens Microsoft Edge with `--app=http://127.0.0.1:<port>`.
  - Autostarts on user login.
- Port: default `4747`, set in the config file (not in the `settings` table). If the port is busy, show a clear Indonesian error.
- Data directory: `C:\ProgramData\TokoPodomoro\` (database, config, logs).
- Uninstall keeps the data directory.
- Manual backup (Stage 6). Auto backup and safe upgrade flow deferred (Stage 10).

### 2.1 Data directory and config
- Data directory resolution, first match wins:
  1. Env var `TOKO_PODOMORO_DATA_DIR` (tests use it for isolated DBs).
  2. Production (`NODE_ENV=production` on Windows, as set by the launcher): `C:\ProgramData\TokoPodomoro\`.
  3. Development: `./data/` at the repo root (git-ignored).
- Config file: `config.json` in the data directory. Created on first start if missing with `{ "port": 4747 }`.
- Database file: `toko-podomoro.db` in the data directory.

## 3. Stack and architecture

| Area | Choice |
|---|---|
| Language | TypeScript |
| Runtime | Node 26 (pinned: `engines`, `.nvmrc`, bundled `node.exe`) |
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
- Build: esbuild bundles the server (including `packages/shared`) into `apps/server/dist/main.js`; native `better-sqlite3` and `pdfkit` (it loads its standard fonts through package `#imports`) stay external. `dist/drizzle/` (migrations) and `dist/public/` (built web app) are copied next to it, so `dist/` plus `node_modules` for those two packages (and their dependencies) is the deployable server.
- Node 26 rationale: better-sqlite3 13.x ships Node-API (v10) prebuilds inside the npm package, including `win32-x64`, so it needs no compiler and works on any Node >= 22. Verified on Node v26.12.0 on 2026-10-19 with install scripts disabled. Node 26 is scheduled for LTS promotion in late October 2026, before the pilot (Stage 6).

## 4. Data rules

### 4.1 Money and quantities
- All money and quantities are integers (Rupiah; base units).
- `products.base_unit` is the stock unit (pcs, gram, ml). Quantity is stored in this unit.
- `pricing_factor`: `1000` for bulk items (prices per kg / per liter), `1` for normal items.
- `products.cost_price` is the cost for `pricing_factor` base units.
- `product_units.sell_price` is the price for `factor` base units.
- `product_units.is_base` marks the primary sell unit (exactly one per product). It is not the stock unit.
- Bulk products: exactly one unit row, `kg` or `liter`, factor `1000`, `is_base = true`. No per-gram/ml price.
- Line formulas:
  - `subtotal = round(qty_base * unit_price / unit_factor)`
  - `cost_total = round(qty_base * cost_price / pricing_factor)`
  - Round half up to 1 Rp, once per line.
- Sale total rounding (setting `rounding`): `none` | `100` | `500`, to nearest; ties round up.
  - `rounding_amount = rounded - sum(subtotals)` (may be negative).
  - `sales.total` is stored after rounding: `total = sum(subtotals) + rounding_amount`.
  - QRIS limit, change, and kasbon all use the rounded total.
- MVP quantity input:
  - Bulk items: integer grams / ml.
  - Normal items: whole numbers only (sell a smaller unit instead of fractions).
- Negative stock is allowed with a warning and surfaced in reports.

### 4.2 Identity, lifecycle, time
- All ids are UUIDs.
- No hard deletes: `active` flag or void status.
- `created_at` on every table; `updated_at` on mutable tables.
- Timestamps stored in UTC as ISO 8601 text with a fixed format: `YYYY-MM-DDTHH:mm:ss.sssZ` (always milliseconds and `Z`, e.g. `2026-10-19T08:30:00.000Z`), produced by `Date.prototype.toISOString()`. The fixed format keeps text comparison and sorting correct.
- "Today" and the TRX number date use the PC's local time zone.
- Product `code` is unique across all products, including inactive ones, ignoring case (`COLLATE NOCASE` index). Category names are unique the same way.

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
- Host header check: every request whose Host hostname is not `127.0.0.1` or `localhost` (any port) is rejected with 403 `FORBIDDEN_HOST`. This blocks DNS-rebinding access from web pages.

### 4.7 Audit log
`audit_logs` is written only for:
- Master data changes: products, product units, categories, customers, suppliers.
- User changes.
- Settings changes.
- All voids (sales, purchases, customer payments, supplier payments).
- Every owner PIN approval.
- Held sale deletions (manual, bulk, and automatic; see 6.1).

Sales, payments, purchases, adjustments, and opname are not audit-logged; their own tables are the record.

## 5. Authentication and authorization

- First-run setup creates the first owner and a one-time recovery code.
- Multiple owners allowed. Each owner has their own recovery code, stored as `users.recovery_code_hash`. After a recovery code is used, a new one is issued for that owner.
- Login: username + 6-digit PIN. Roles: `owner`, `cashier`.
  - From Stage 5, login shows a tile per active user plus a PIN pad (`ui-style.md` section 5). Tiles come from an unauthenticated endpoint returning only `id`, display name, and role: no usernames, no inactive users. Login then sends the chosen user's `id` + PIN.
- Sessions stored in DB (survive server restart); httpOnly cookie. A session ends on logout or after 12 h of inactivity.
- The last active owner cannot be deactivated. Owners cannot deactivate themselves.
- PIN resets:
  - An owner can reset a cashier's PIN to a temporary PIN; the cashier must change it at next login (`users.must_change_pin`).
  - An owner's PIN can only be reset by that owner, via their own recovery code. No owner can reset another owner's PIN.
- New users: a PIN chosen by someone else is temporary, so every user created in user management starts with `must_change_pin = true`.
  - While `must_change_pin` is set, only `GET auth/me`, `PUT auth/me/pin`, and `POST auth/logout` are allowed (403 `PIN_CHANGE_REQUIRED`).
  - A new owner's recovery code is issued when they set their own PIN (response of `PUT auth/me/pin`), so the creating owner never sees it. Until then that owner has no recovery code.
- Username and role are fixed at creation. Name, active flag, and (cashiers only) PIN are editable.
- Deactivating a user or resetting their PIN ends their open sessions.
- Until approval tokens exist (Stage 5), PIN endpoints return 403 `OWNER_APPROVAL_REQUIRED` for cashiers.
- Hashing: PINs and recovery codes are stored as salted scrypt hashes; session tokens (256-bit random) as SHA-256 hashes. Cookie `toko_session`: httpOnly, `SameSite=Strict`, path `/`.
- Owner approval:
  - Owner logged in directly needs no approval token.
  - Cashier obtains owner approval by entering an owner PIN (`POST auth/approve`) -> short-lived token kept in server memory, sent as `X-Approval-Token`.
  - Action tokens (e.g. void) are single-use.
- Auto-lock after idle (`auto_lock_minutes`, default 5) and quick lock with `Ctrl+L`.
  - Lock screen unlocks only for the same user.
  - "Ganti pengguna" goes to the login page.
- No lockout on wrong PIN.
- Cashier needs owner PIN for: all voids, reports, user management, store settings, product price changes and product deactivation (6.5), category management. Everything else is open.

## 6. Features

### 6.1 Cashier screen (Kasir)
- Full-screen layout (no sidebar).
- Search by product code or name. No product creation; unknown item shows "Barang tidak ditemukan".
- Per line: choose unit, edit quantity, remove line.
- Payment: cash and/or QRIS (QRIS recorded manually, no integration).
  - QRIS amount <= rounded total.
  - Change is given from cash only.
- Underpayment -> kasbon confirmation dialog; must pick an existing customer or quick-add one.
- Hold sale (Tahan):
  - Stored in DB with status `held`, no TRX number, no stock reservation.
  - On resume, prices are refreshed from current product data. Lines with deactivated products are removed and the user sees a notice.
  - Held sales are drafts, so they are deleted (the one exception to "no hard deletes"); every deletion is audit-logged (entity `held_sale`).
  - Held sales from previous local days are labeled "kemarin" and can be bulk-deleted.
  - On server start, held sales older than 7 days are deleted automatically (audit action `auto_delete`, no user).
- TRX number `TRX-YYYYMMDD-NNNN` assigned on completion. `NNNN` resets daily from `0001` (local date); after `9999` it grows to 5+ digits.
- Cancel sale before payment.
- Void after payment:
  - Needs owner PIN.
  - Rejected if the sale's receivable has any active payments.
  - Returns stock (movements of type `void`) and voids the receivable.

### 6.2 Receipt
- After payment: prompt "Simpan nota PDF?" — `Enter` = yes, `Esc` = skip.
- Server generates the PDF (58 or 80 mm, setting) and saves it to the receipt folder (setting `receipt_folder`; default `%USERPROFILE%\Documents\TokoPodomoro\Nota\<TRX>.pdf`).
- Then shows "Nota tersimpan" with buttons:
  - **Buka**: server opens the PDF in the Windows default viewer.
  - **Buka folder**: server opens the receipt folder in Explorer.
  - **Unduh**: browser download.
- Transaction detail offers the same buttons.
- Reprints marked "SALINAN"; voided sales marked "DIBATALKAN".

### 6.3 Keyboard UX
- Fully keyboard-driven. Focus always returns to search. Large fonts.
- App captures F1-F10 over Edge defaults. F11 and F12 are not used.
- F-key capture is tested manually in Edge `--app` mode on Windows (Stage 6 checklist). If a key cannot be captured, its action falls back to `Alt+<number>` (e.g. `Alt+1` for F1).

### 6.4 Transaction history (Riwayat Transaksi)
- Defaults to today. Filters: date, text, status.
- Open to cashier.
- Save / download a receipt copy.

### 6.5 Products (Barang)
- `code`: unique (including inactive), editable.
- `name`.
- Category; defaults: Rokok, Sembako, Lain-lain. Owner can add categories.
- Cashier permissions (owner session passes directly; cashiers need owner approval, and until Stage 5 get 403 `OWNER_APPROVAL_REQUIRED`; the UI shows the PIN hint):
  - Open to cashiers: create products (including their initial prices) and edit code, name, category, type, base unit, and unit rows (name, factor, primary flag, deactivate) except prices.
  - Needs approval: changing any `sell_price` or `cost_price`, adding a unit row (it introduces a sell price), and deactivating a product. Reactivating is open.
  - All product, unit, and category changes are audit-logged.
- Stock unit lock: once a product has any stock movement, its type (`unit`/`bulk`) and stock unit kind (bulk `gram` <-> `ml`) cannot change (409 `STOCK_UNIT_LOCKED`; the message suggests deactivating it and creating a new product). Stock is never converted. Renaming the stock unit label of a normal product (e.g. `pcs` -> `bks`) is allowed. `Product.hasStockMovements` tells the UI to lock these fields.
- Type: `unit` | `bulk`.
- Base (stock) unit; cost price.
- Unit rows: name, factor, sell price; exactly one `is_base` (primary sell) row. Unit rows also serve as wholesale pricing (normal products only).
- Bulk products: single `kg`/`liter` row, factor 1000 (see 4.1).
- Deactivate, never delete.
- CSV/Excel import with downloadable template and validation preview.

### 6.6 Stock (Stok) and suppliers (Pemasok)
- Purchases from suppliers (Stok Masuk):
  - No edit.
  - New cost price entered manually, with suggestions (last buy price, weighted average) and margin shown.
  - Initial paid amount creates a `supplier_payments` row + `supplier_allocations` row.
- Purchase void (owner PIN):
  - Allowed only if the purchase has no active payments besides the initial one.
  - Voids the initial payment and its allocations.
  - Stock reversed via `purchase_void` movements.
  - `cost_price` is not reverted; the owner sees a reminder to review the cost price of affected products.
- Supplier debt payments are allocated to ticked purchases (oldest pre-ticked).
- Supplier payment void (owner PIN): allocations reversed, purchase `remaining` restored.
- Adjustments with reason: `rusak`, `kedaluwarsa`, `hilang`, `opname`, `lainnya`.
- Stock opname is a session:
  - Start: creates `stock_opnames` (status `open`); `system_qty_at_start` is recorded for each product counted.
  - Enter counted quantities (`counted_qty`); sales continue during the session.
  - Complete: per item, `delta = counted_qty - system_qty_at_start`, applied as an adjustment (reason `opname`) to current stock.
  - Cancel: status `cancelled`, no stock change.
- Movement history.

### 6.7 Customers and kasbon (Pelanggan)
- Name required; phone and note optional. Cashier may add customers.
- One receivable per sale.
- Customer payment (cash/QRIS) is allocated to ticked receivables:
  - Oldest receivable pre-ticked.
  - A partial amount fills the oldest selected receivable first.
  - Allocation cannot exceed the ticked total.
  - For cash, enter the amount received and show change.
- Customer payment void (owner PIN): allocations reversed, receivable `remaining` restored (status back to `open`).
- No credit limit.
- Customer ledger (Kartu Piutang) and receivables list (Daftar Piutang).
- Customer payments are numbered `BYR-YYYYMMDD-NNNN` (local date, daily reset, same rules as TRX).
- Payment receipt: optional PDF with the same flow as sale receipts ("Simpan bukti bayar PDF?", Enter = save, Esc = skip; then Buka, Buka folder, Unduh; later copies "SALINAN"). It lists the allocated receivables (sale number, amount applied, remaining), amount paid, change, and the customer's remaining total kasbon.
- Sale receipts with kasbon also show the customer name, the kasbon amount, and the customer's total remaining kasbon.
- Remaining kasbon on receipts is a snapshot taken when the sale or payment is saved (`balance_after`), so reprints match the original.
- One payment uses one method. Cash: the amount received is entered; the applied amount is `min(received, ticked total)` and the rest is change. QRIS: the amount must not exceed the ticked total.
- A customer with remaining kasbon cannot be deactivated.

### 6.8 Reports (Laporan, owner)
- Sales and profit.
- Per category: revenue, profit, margin, share.
- Top and slow-moving products.
- Stock value: negative stock counted as 0; negative-stock items listed separately.
- Negative-stock items.
- Cash vs QRIS.
- Daily cash flow = cash sales − change + cash kasbon payments − cash supplier payments. No opening balance until shifts exist.
- Receivables and payables.
- Stock losses.
- Activity log (includes voided records).
- Category filter only on product-based reports: category sales, top/slow products, stock value, stock losses.
- Voided sales, purchases, and payments are excluded from all totals.
- Export to PDF and Excel.

## 7. Pages

Sidebar layout on all pages except Kasir. Visual design and locked layouts: `ui-style.md`.

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

| Key | Fallback | Action |
|---|---|---|
| F1 | Alt+1 | Kasir |
| F2 | Alt+2 | Cari (focus search) |
| F3 | Alt+3 | Barang |
| F4 | Alt+4 | Stok |
| F5 | Alt+5 | Pelanggan |
| F6 | Alt+6 | Riwayat |
| F8 | Alt+8 | Bayar |
| F9 | Alt+9 | Tahan |
| Esc | | Batal / tutup |
| Ctrl+L | | Kunci |

Fallbacks are enabled only for keys that fail the Windows capture test (Stage 6 checklist). F11 and F12 are never used.

## 9. Database tables

All tables have `id` (UUID) and `created_at`; mutable tables also have `updated_at`.

### 9.1 System
- `users`(username, name, role, pin_hash, recovery_code_hash, must_change_pin, active) — `recovery_code_hash` for owners only; `username` unique, lowercase
- `sessions`(user_id, token_hash, expires_at, last_seen_at) — expires after 12 h of inactivity
- `settings`(key, value)
- `audit_logs`(user_id, approved_by, entity, entity_id, action, old_value, new_value)

### 9.2 Catalog
- `categories`(name, is_default, active)
- `products`(code, name, category_id, type, base_unit, pricing_factor, cost_price, stock, active)
- `product_units`(product_id, name, factor, sell_price, is_base, active)

### 9.3 Sales
- `sales`(number, cashier_id, customer_id, status, total, rounding_amount, paid_total, change_amount, debt_amount, completed_at, voided_at, voided_by, void_reason, receipt_count, receipt_file)
  - `id` is the client UUID. `customer_id` is added with customers in Stage 4.
  - `receipt_count`: receipts generated so far (every one after the first is "SALINAN"); `receipt_file`: last saved receipt PDF.
  - `number`: `TRX-YYYYMMDD-NNNN`, nullable while held.
  - `status`: `held` | `completed` | `voided`.
  - `total` is after rounding.
- `sale_items`(sale_id, line_no, product_id, unit_id, product_code, product_name, unit_name, qty_base, unit_factor, unit_price, cost_price, pricing_factor, subtotal, cost_total)
- `sale_payments`(sale_id, method, amount) — `method`: `cash` | `qris`; cash `amount` is the cash received, change is `sales.change_amount`

### 9.4 Customers and receivables
- `customers`(name, phone, note, active)
- `receivables`(customer_id, sale_id, amount, remaining, status) — `status`: `open` | `paid` | `void`; one per sale (`sale_id` unique); `remaining = amount - sum(active allocations)`
- `customer_payments`(number, customer_id, method, amount, amount_received, change_amount, balance_after, user_id, status, voided_at, voided_by, receipt_count, receipt_file) — `id` is the client UUID; `number` `BYR-YYYYMMDD-NNNN`; `amount` is the applied amount; `status`: `active` | `voided`
- `payment_allocations`(payment_id, receivable_id, amount)
- `sales` gains `customer_id` and `customer_balance_after` (customer's remaining kasbon after the sale, for the receipt).

### 9.5 Suppliers and purchases
- `suppliers`(name, phone, note, active)
- `purchases`(supplier_id, date, total, paid_amount, remaining, status, voided_at, voided_by, user_id, note) — `status`: `completed` | `voided`
- `purchase_items`(purchase_id, product_id, unit_id, qty_base, unit_factor, buy_price, subtotal, new_cost_price)
- `supplier_payments`(supplier_id, method, amount, user_id, status, voided_at, voided_by) — `status`: `active` | `voided`
- `supplier_allocations`(payment_id, purchase_id, amount)

### 9.6 Stock
- `stock_adjustments`(product_id, qty_change, reason, note, cost_price, user_id)
- `stock_movements`(product_id, qty_change, type, ref_id, user_id) — `type`: `sale` | `void` | `purchase` | `purchase_void` | `adjustment`
- `stock_opnames`(status, started_at, completed_at, user_id) — `status`: `open` | `completed` | `cancelled`
- `stock_opname_items`(opname_id, product_id, system_qty_at_start, counted_qty)

### 9.7 Settings keys
- `store_name`, `store_address`, `store_phone`, `receipt_footer`
- `rounding`: `none` | `100` | `500`
- `receipt_width`: `58` | `80`
- `receipt_folder` (default `%USERPROFILE%\Documents\TokoPodomoro\Nota`)
- `auto_lock_minutes` (default `5`)

Port is not a setting; it lives in the config file.

## 10. API

Base path `/api`, JSON bodies, httpOnly session cookie. **(PIN)** = cashier needs `X-Approval-Token`.

### Health
- `GET health` -> `{ status: "ok", version }`. No auth. Used by the web app and, later, the launcher to detect a running server.

### Setup and auth
- `GET setup/status`, `POST setup`
- `POST auth/login`, `POST auth/logout`, `POST auth/unlock`, `POST auth/approve`, `POST auth/recover`
- `GET auth/me`, `PUT auth/me/pin`
- `GET auth/users` (Stage 5): no auth; active users only, `{ users: [{ id, name, role }] }`. Never usernames or inactive users.

### Users (PIN)
- `GET users`, `POST users`, `PUT users/:id`
- `PUT users/:id` accepts `name`, `active`, and `pin` (temporary PIN; cashier targets only).

### Products and categories
- `GET products` (q, categoryId, status `active|inactive|all` default active, page, limit <= 100) -> `{ products, total, page, limit }`. Every word of `q` must appear in the code or name; exact code match first.
- `GET products/by-code/:code` (active only, ignoring case), `GET products/:id`
- `POST products` (optional `initialStock` -> stock adjustment `lainnya`, note "Stok awal"), `PUT products/:id` (full field set; `units` is the full set of active rows: rows with `id` update, without `id` are added, left-out rows are deactivated), `PATCH products/:id/active`
- Cashier approval rules for products: see 6.5.
- `POST products/import/preview`, `POST products/import`, `GET products/import/template`
- `GET categories`, `POST categories` (PIN), `PUT categories/:id` (PIN; default categories cannot be deactivated)

### Sales
- `POST sales` `{ id (client UUID), lines: [{ productId, unitId, qtyBase }], cash, qris, expectedTotal }` -> `{ sale, warnings }`. The server prices every line from current data; if its rounded total differs from `expectedTotal` it refuses with 409 `TOTAL_CHANGED`. `warnings` lists products now below zero stock. Until Stage 4, underpayment is refused (400 `UNDERPAID`).
- `POST sales/held`, `GET sales/held`, `DELETE sales/held/:id`, `DELETE sales/held?before=YYYY-MM-DD` (bulk-delete "kemarin" and older)
- `POST sales/held/:id/resume` -> `{ lines: [{ product, unitId, qtyBase, heldUnitPrice }], removed: [names] }`; removes the held sale (not audit-logged: it goes back into the cart).
- `GET sales` (from, to = local days, default today; q = number, product code or name; status `completed|voided|all`; page, limit), `GET sales/:id`
- `POST sales/:id/receipt` (save PDF to receipt folder as `<TRX>.pdf`; later receipts `<TRX>-SALINAN.pdf`)
- `POST sales/:id/receipt/open` (open saved PDF in default viewer), `POST receipts/open-folder`
- `GET sales/:id/receipt.pdf` (download)
- `POST sales/:id/void` (PIN)

### Customers and kasbon
- `GET customers` (q, status, page, limit; each with `balance`), `GET customers/:id`, `POST customers`, `PUT customers/:id` (name, phone, note, active), `GET customers/:id/ledger`
- `GET receivables` (customerId, status `open|all`; oldest first)
- `POST customer-payments` `{ id (client UUID), customerId, receivableIds, method, amount }` (`amount` = cash received or QRIS amount), `GET customer-payments/:id`
- `POST customer-payments/:id/receipt`, `POST customer-payments/:id/receipt/open`, `GET customer-payments/:id/receipt.pdf`
- `POST customer-payments/:id/void` (PIN; Stage 5)
- `POST sales` takes an optional `customerId`; with it, an underpayment becomes kasbon (one receivable, `debt_amount`). Without it, underpayment is refused.

### Suppliers and stock
- `GET suppliers`, `POST suppliers`, `PUT suppliers/:id`, `GET suppliers/:id/ledger`
- `GET purchases`, `GET purchases/:id`, `POST purchases`, `POST purchases/:id/void` (PIN), `GET purchases/cost-suggestion`
- `POST supplier-payments`, `POST supplier-payments/:id/void` (PIN)
- `POST stock-adjustments`
- `POST stock-opname` (start), `PUT stock-opname/:id/items`, `POST stock-opname/:id/complete`, `POST stock-opname/:id/cancel`
- `GET stock-movements`

### Reports (PIN)
- `GET reports/summary`, `reports/categories`, `reports/products`, `reports/stock-value`, `reports/cash`, `reports/debts`, `reports/losses`, `reports/activity`
- `GET reports/:type/export?format=pdf|xlsx`

### Settings
- `GET settings` (any user; Stage 3), `PUT settings` (PIN; Stage 5)
- Defaults until set: `store_name` "TOKO PODOMORO", `rounding` `none`, `receipt_width` `58`, `receipt_footer` "Terima kasih atas kunjungan Anda", `auto_lock_minutes` 5.

## 11. Roadmap

Tracked with checkboxes in `../production_checklist.md`.

| Stage | Scope | Done when |
|---|---|---|
| 0 Foundation | Monorepo, server serving web + /api on 127.0.0.1:4747, SQLite setup, migration framework, error format, shared math + tests | One command runs app; math tests pass |
| 1 Users | Setup, login/logout, DB sessions, roles, user mgmt, recovery codes | Owner and cashier see correct menus; session survives restart |
| 2 Products | Categories, CRUD, multi-unit, bulk, search/filter, audit log, initial stock via adjustment | 100 products entered and searchable |
| 3 Cashier | Search, units, cash/QRIS, rounding, atomic save, idempotency, hold, receipt PDF (folder + download), transaction history, keyboard UX | 50 test sales, stock matches movements, receipts correct |
| 4 Kasbon | Customers, auto kasbon, payments with allocation, ledger | Balances always reconcile |
| 5 PIN & void | Approval tokens, sale void, customer payment void, auto-lock, switch user | MVP; tag `v0.1.0-mvp` |
| 6 Distribution | Installer, portable Node, launcher, autostart, port config, manual backup | Runs on clean PC; pilot store; tag `v0.2.0-pilot` |
| 7 Stock & suppliers | Purchases, cost suggestions, supplier debt, purchase and supplier payment void, adjustments, opname sessions, movement history | Stock and payables reconcile with movements/allocations |
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

Not decided. Do not implement a choice without asking. Tagged with the stage that needs the answer.

1. [Stage 5] Should failed PIN attempts be logged?
2. [Stage 5] Approval token lifetime, and the scope of menu-access tokens (e.g. one Laporan visit vs. a time window).
3. [Stage 7] Can a purchase's initial payment be voided on its own (leaving the purchase as debt), or only via purchase void?
4. [Stage 7] Can a product be in more than one open opname session at a time? Can multiple sessions be open?
5. [Stage 7] Is the opname adjustment valued at the product's current `cost_price` at completion?
6. [Stage 8] A sale voided on a later day: is it removed from its original day's totals (reports change retroactively) or shown as a negative on the void day?
