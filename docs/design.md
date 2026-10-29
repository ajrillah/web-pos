# TOKO PODOMORO — Design Specification

Offline point-of-sale web app for Indonesian grocery stores (toko kelontong), sold commercially. Slug: `toko-podomoro`.

- UI text: Indonesian. Code, comments, commits: English.
- Roadmap and progress: `../production_checklist.md`.
- Items in section 14 are undecided; do not implement a choice without asking.

---

## 1. Product

- Runs on a single Windows PC.
- Server binds `127.0.0.1` only. Fully offline. No LAN access, no outbound network requests.
- Browser UI and API are served by one Node process on one port.

## 2. Packaging and distribution (Stage 6)

- Windows installer built with NSIS; bundles a portable `node.exe` (no system Node needed). Details: section 11.
- The server runs under the logged-in Windows user, started by the launcher (not a Windows service).
- Launcher (`launcher.vbs`, section 11.1):
  - Starts the server; prevents a duplicate server (if already running, only opens the window).
  - Opens Microsoft Edge with `--app=http://127.0.0.1:<port>`.
  - Autostarts on user login.
- Port: default `4747`, set in the config file (not in the `settings` table). If the port is busy, show a clear Indonesian error.
- Data directory: `C:\ProgramData\TokoPodomoro\` (database, config, logs).
- Uninstall keeps the data directory.
- Manual backup and restore (Stage 6, section 11.4). Auto backup and safe upgrade flow deferred (Stage 10).

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
- `product_units.sell_price` is the price for one of that unit (`factor` base units); `product_units.cost_price` is the cost for one of that unit.
- Unit rows form a pyramid per product; `factor` (base units in one of the unit) is computed, never stored. See 4.1.1.
- Bulk products: exactly one unit row, `kg` or `liter`, `isi` `1000` (so factor `1000`). No per-gram/ml price.
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

#### 4.1.1 Unit pyramid (MS1)

A product's unit rows form a tree in `product_units`: `parent_unit_id` (nullable, self reference) and `level` (`1` = largest, up to `MAX_PYRAMID_LEVELS` = 5 = smallest). `level` also orders a flat product's rows, which are capped by `MAX_UNITS_PER_PRODUCT` (10) instead. A product is in one of two shapes, and `Product.unitMode` reports which:

- **`pyramid`** (new and edited products): one chain of 1-5 levels, one unit per level. Level 1 has no parent; every deeper level has the level above as its parent. The deepest level is the stock unit: its name is `products.base_unit` and its factor is 1.
- **`flat`** (products created before MS1, and every bulk product): every row has `parent_unit_id = NULL` and its own factor to the stock unit. Existing products are not converted; they keep working unchanged. Editing one through the product form turns it into a pyramid (unless its structure is locked, see 6.5).

`isi` is the conversion stored per row:

- A row with a parent: how many of **this** unit fit in **one** of its parent. Level 1 of a pyramid has no parent and stores `isi = 1`.
- A flat row (no parent and no children): how many **base units** fit in one of this unit (what `factor` used to hold).

Everything else is computed from `isi`:

- `factor` (base units in one of the unit) = product of the `isi` values of the levels **below** this one, so the deepest level is 1; for a flat row, its own `isi`. All line math keeps using `factor` (see the line formulas above) and `sale_items` / `purchase_items` keep snapshotting it.
- The **primary sell unit** (default unit on the cashier screen; `Product.units[].isBase` in the API) is the row with the highest `level`. For a pyramid that is the smallest unit; for a flat product it is the row the owner marked as primary, which the MS1 migration moved to the deepest level.
- `isi` <= `MAX_UNIT_FACTOR` (1 000 000) per row, and a product's largest factor stays within it.

Cost price (HPP) down a pyramid:

- Level 1: entered by the user (`units[0].costPrice` in a `pyramid` request).
- Level 2 and below: `cost = ceil(parent_cost / isi)` - rounded **up**, step by step down the chain, so a level is never priced below what it costs. The form shows "(dibulatkan)" next to a level whose cost was rounded.
- `products.cost_price` is the deepest level's cost, i.e. the cost of one base unit (`pricing_factor` = 1 for pyramid products), so stock value and `cost_total` are unchanged.
- Every level: `sell_price >= cost_price` (400 `INVALID_UNITS`). Flat products keep their own cost (`costPrice` on the product) and are not checked this way.

Stock display:

- Stock stays an integer count of base units everywhere (`products.stock`, `stock_movements.qty_change`, quantity input).
- A pyramid product's stock is **shown** as a multi-unit breakdown, filled top-down by integer division: 3 806 base units over Ball (200) / Slop (10) / Bungkus (1) reads `1 Ball 19 Slop 6 Bungkus`. Levels with a zero count are left out; a stock of 0 reads `0 <deepest unit>`; negative stock keeps one leading minus (`-1 Slop 2 Bungkus`).
- Flat products are shown as before: the number and the stock unit (`12 pcs`).
- One implementation for both: `formatStockPyramid(qty, chain, baseUnit)` in `packages/shared`, with `chain` the product's levels top-down (empty for flat products). API rows that show a stock level carry that `unitChain`.

### 4.2 Identity, lifecycle, time
- All ids are UUIDs.
- No hard deletes: `active` flag or void status.
- `created_at` on every table; `updated_at` on mutable tables.
- Timestamps stored in UTC as ISO 8601 text with a fixed format: `YYYY-MM-DDTHH:mm:ss.sssZ` (always milliseconds and `Z`, e.g. `2026-10-19T08:30:00.000Z`), produced by `Date.prototype.toISOString()`. The fixed format keeps text comparison and sorting correct.
- "Today" and the TRX number date use the PC's local time zone.
- Product `code` is unique across all products, including inactive ones, ignoring case (`COLLATE NOCASE` index). Category names are unique the same way.

### 4.3 Sales snapshots
- Sale items snapshot: product code, product name, category (id and name), unit name, sell price, cost price (and factors), computed `subtotal` and `cost_total`.
- Reports group sales by the category snapshot, so moving a product to another category (or renaming a category) never changes past reports. Lines sold before the snapshot existed (migration 0008) took the product's category at migration time.
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
- Every owner PIN approval, and every failed PIN attempt (login, unlock, approval).
- Held sale deletions (manual, bulk, and automatic; see 6.1).

Sales, payments, purchases, adjustments, and opname are not audit-logged; their own tables are the record.

## 5. Authentication and authorization

- First-run setup creates the first owner and a one-time recovery code.
- Multiple owners allowed. Each owner has their own recovery code, stored as `users.recovery_code_hash`. After a recovery code is used, a new one is issued for that owner.
- Login: user tile + 6-digit PIN (by user id). Roles: `owner`, `cashier`. PIN recovery still uses the username.
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
- Cashiers without a valid approval token get 403 `OWNER_APPROVAL_REQUIRED`; the UI then opens the owner PIN dialog and retries.
- Hashing: PINs and recovery codes are stored as salted scrypt hashes; session tokens (256-bit random) as SHA-256 hashes. Cookie `toko_session`: httpOnly, `SameSite=Strict`, path `/`.
- Owner approval:
  - Owner logged in directly needs no approval token.
  - Cashier obtains owner approval by entering an owner PIN (`POST auth/approve`) -> short-lived token kept in server memory, sent as `X-Approval-Token`.
  - With exactly one active owner, the dialog asks only for the PIN. With more than one, it first shows owner tiles; the PIN is then checked against the chosen owner only (`ownerId` in the request; required when several owners are active). The approving owner is recorded as `approved_by`.
  - Tokens are bound to the cashier's session and to one scope; lost on server restart.
  - Action tokens (voids, product price changes, product deactivation, category changes) are single-use, tied to their target (sale, payment, product) when there is one, and expire after 5 minutes if unused. A token is spent only when the action succeeds.
  - Menu-access tokens (Laporan, Pengguna, Profil Toko, Impor barang) last while the cashier stays in that menu, at most 15 minutes. Leaving the menu (the page releases the token), locking the screen, or logging out invalidates them.
  - Every granted approval is audit-logged (entity `approval`), and the approved action's own audit row carries `approved_by`.
- Failed PIN attempts (login, unlock, approval) are audit-logged with the user, time, and intended action (entity `auth`, action `failed_pin`). No lockout. They appear in the activity report (Stage 8).
- Auto-lock after idle (`auto_lock_minutes`, default 5) and quick lock with `Ctrl+L`.
  - The lock is stored on the session (`sessions.locked_at`), so a reload stays locked. While locked only `auth/me`, `auth/unlock`, `auth/logout`, and `auth/users` work (403 `SESSION_LOCKED`).
  - Lock screen unlocks only for the same user.
  - "Ganti pengguna" ends the session and goes to the login page.
- No lockout on wrong PIN.
- Backup and restore are owner only (section 11.4); no approval lets a cashier use them.
- Cashier needs owner PIN for: all voids, reports, user management, store settings, product price changes and product deactivation (6.5), category management, product import (6.5). Everything else is open.

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
  - A reason is required, picked from quick choices: "Salah input", "Pembeli batal", or "Lainnya" (then a note is required). Stored as `void_reason` ("Lainnya: <note>" for the last). The same applies to customer payment voids.
  - Rejected if the sale's receivable has any active payments.
  - Returns stock (movements of type `void`) and voids the receivable.

### 6.1.1 Kasir revisions (MS2)
- Customer on all sales: `sales.customer_id` is nullable; `NULL` means "UMUM" (display only, no dummy record). The cashier can pick or quick-add a customer on any sale, paid or kasbon. The Kasir shows a customer picker before payment.
- Price override: the cashier can change the sell price per cart line freely, with no owner PIN. The only validation is `sell_price >= cost_price` at that unit's level. The overridden price is stored in `sale_items.unit_price`.
- Item note: `sale_items.note` (nullable text). Optional per cart line; printed on the receipt in parentheses after the product name, e.g. "Indomie Goreng (Aceh)".
- Qty minus (return): a cart line may carry a negative quantity, stored as a separate `sale_items` row. Negative quantity adds stock back (a `stock_movement` with positive `qty_change`), and reduces the sale total, omzet, and profit. A sale can mix positive and negative lines; the net total must be >= 0.
- Transfer bank: `transfer` is a third payment method alongside `tunai` and `qris`, with the same flow as QRIS (no change calculation).
- Auto-hold: when the cart has items and the user navigates away (an F-key to another menu or any route change), the cart is auto-saved as a held sale in the DB, with toast "Nota ditahan otomatis". On return to Kasir the held-sales list is shown if any exist.
- Held-sales list info: shows the nota number (or "DRAFT" for a held sale) and the customer name (or "UMUM").
- Print draft held: a held sale can be printed as-is with a "DRAFT" watermark. It is not recorded as a completed sale and does not affect stock or omzet.
- Total items: the cart summary shows the line count as "Total Item: N".

### 6.1.2 Nota and global revisions (MS3)
- Receipt file name: saved/printed receipts use `JENIS-DDMMYY-NomorNota-NamaCustomer`, where `JENIS` is the document number's prefix (`TRX` for a sale, `BYR` for a kasbon payment) and `NomorNota` its daily sequence, e.g. `TRX-011026-0001-BIMA` and `BYR-011026-0001-BIMA`. Without the prefix a sale and a payment of the same day, number, and customer would overwrite each other. `UMUM` when the customer is NULL; the customer name is sanitized (only letters and digits kept).
- No "SALINAN"/copy marking: receipts may be printed repeatedly without any copy indicator.
- Kasbon summary on receipt: when the sale is kasbon, print `Kasbon Sebelumnya`, `Kasbon Transaksi Ini`, and `Total Kasbon`.
- Item note on receipt: `sale_items.note` is printed in parentheses after the product name.
- Total items on receipt: print `Total Item: N`.
- Uppercase auto-convert: all user text inputs (product name, category name, customer name, supplier name, notes, item notes) are converted to uppercase server-side (service/repository layer); frontend inputs use CSS `text-transform: uppercase`.
- Price alert: `products.price_alert` (boolean, default false) is set true when a purchase records a `cost_price` higher than the current one; cleared when an owner updates the product's sell price to at least the new cost. A warning icon is shown on the product list for flagged products.

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
  - Open to cashiers: create products (including their initial prices) and edit code, name, category, type, base unit, and unit rows (name, `isi`, primary flag, deactivate) except prices.
  - Needs approval: changing any `sell_price` or `cost_price`, adding a unit row or pyramid level (it introduces a sell price), and deactivating a product. Reactivating is open.
  - All product, unit, and category changes are audit-logged.
- Stock unit lock: once a product has any stock movement, its type (`unit`/`bulk`), its stock unit kind (bulk `gram` <-> `ml`), and the identity of its smallest unit cannot change (409 `STOCK_UNIT_LOCKED`; the message suggests deactivating it and creating a new product). Stock is never converted, so the deepest level keeps its row and its `isi`, and no level may be added below it. Levels above it may be added or changed, and renaming the stock unit label of a normal product (e.g. `pcs` -> `bks`) is allowed. `Product.hasStockMovements` tells the UI to lock these fields.
- Type: `unit` | `bulk`.
- Base (stock) unit; cost price.
- Unit rows: name, `isi`, cost price, sell price; the pyramid rules are in 4.1.1. Larger levels also serve as wholesale pricing (normal products only).
- Product form, unit pyramid (MS1): filled top-down. The user enters level 1 (name, cost price, sell price), then adds the level below it (name, `isi` = how many fit in one of the level above, sell price; its cost price is filled in automatically and shown read-only, with "(dibulatkan)" when `ceil` changed it), up to 5 levels. Only the last level can be removed. The stock unit follows the deepest level's name. Bulk products keep their single `kg`/`liter` row (`isi` 1000, see 4.1) instead of a pyramid.
- Flat (pre-MS1) products keep their rows until they are edited; a product whose smallest unit is locked by stock movements keeps its current shape, and only its prices can change.
- Deactivate, never delete.
- CSV/Excel import with downloadable template and validation preview (see Import below).

#### Import (Stage 9)
- Creates new products only. A code that already exists (ignoring case, including inactive products) is a row error, never an update. A code repeated within the file is also a row error.
- Needs owner approval: menu token `impor` (like `laporan`), entered when a cashier opens the Impor tab; it covers template download, preview, and commit (max 15 minutes). The tab shows the PIN hint for cashiers.
- Category must already exist (name ignoring case) and be active; otherwise a row error.
- Template columns, in order: `kode`, `nama`, `kategori`, `jenis` (`satuan` / `curah`), `satuan_stok`, `harga_pokok`, `satuan_jual` (primary unit name), `harga_jual`, `satuan2_nama`, `satuan2_isi`, `satuan2_harga`, `satuan3_nama`, `satuan3_isi`, `satuan3_harga`, `stok_awal`.
  - The extra-unit and `stok_awal` columns are optional (the columns may be left out). Columns are matched by header name in row 1; unknown columns are ignored.
  - Normal products: the primary unit has factor 1; `harga_pokok` is per stock unit. An extra unit needs name, `isi` (factor), and price together; unit names must differ. Import creates flat unit rows (`isi` = factor to the stock unit), not a pyramid.
  - Bulk (`curah`): `satuan_stok` is `gram` (also `g`, `gr`) or `ml`, `pricing_factor` 1000, `harga_pokok` and `harga_jual` per kg / liter. One unit row (`kg` / `liter`, factor 1000, primary) is created automatically, as in manual creation; `satuan_jual` may be blank or must match it; extra units are refused.
  - Money and quantities are whole numbers: plain digits or dot thousands (`12.500`).
  - `stok_awal` (stock unit; grams / ml for bulk) is recorded as a stock adjustment, reason `lainnya`, note "Stok awal (impor)".
- Template is an .xlsx: sheet "Barang" (header row with a note per column) and sheet "Petunjuk" (column notes and example rows). Import reads .xlsx (sheet "Barang", else the first sheet) and UTF-8 .csv (`,` or `;` delimiter).
- Limits: 5 MB per file, 2000 data rows per file. Empty rows are skipped.
- All-or-nothing per file: if any row has an error, nothing is saved. The preview lists every row (valid rows too) with its errors. The commit re-checks every row in the same transaction that creates the products.
- Audit: each imported product and unit row is audit-logged (`create`) like manual creation, with the approving owner as `approved_by` for cashiers.

### 6.6 Stock (Stok) and suppliers (Pemasok)
- Purchases from suppliers (Stok Masuk):
  - No edit. A supplier is required; purchases are numbered `BLI-YYYYMMDD-NNNN`, supplier payments `BYH-YYYYMMDD-NNNN` (same rules as TRX).
  - Lines use the product's active unit rows; `buy_price` is per unit row (bulk: per kg/liter, quantity in g/ml). A product appears at most once per purchase.
  - New cost price entered manually, with suggestions (last buy price, weighted average) and margin shown. Changing a cost price this way needs owner approval for cashiers (same rule as product price changes) and is audit-logged on the product.
  - Initial paid amount creates a `supplier_payments` row + `supplier_allocations` row.
  - Purchase and supplier payment voids take a reason: "Salah input" or "Lainnya" (with a note).
- Purchase void (owner PIN):
  - Allowed only if the purchase has no active payments besides the initial one.
  - Voids the initial payment and its allocations.
  - Stock reversed via `purchase_void` movements.
  - `cost_price` is not reverted; the owner sees a reminder to review the cost price of affected products.
- Supplier debt payments are allocated to ticked purchases (oldest pre-ticked).
- Supplier payment void (owner PIN): allocations reversed, purchase `remaining` restored.
  - A purchase's initial payment can be voided on its own the same way; its amount becomes debt again and the purchase stays completed.
- Adjustments with reason: `rusak`, `kedaluwarsa`, `hilang`, `opname`, `lainnya`.
- Stock opname is a session, one per category:
  - Start: creates `stock_opnames` (status `open`); `system_qty_at_start` is recorded for each product counted.
  - A product can be in only one open session. Sessions for other categories may run in parallel; starting a session that would include a product already in an open session is refused (409).
  - Enter counted quantities (`counted_qty`); sales continue during the session.
  - Complete: per item, `delta = counted_qty - system_qty_at_start`, applied as an adjustment (reason `opname`) to current stock. The adjustment is valued at the product's `cost_price` at completion time (`stock_adjustments.cost_price`).
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
- Cash vs QRIS vs transfer bank: one section per method. Kasbon and supplier payments only ever move cash or QRIS, so the transfer section covers sales and their voids only (MS2).
- Daily cash flow = cash sales − change + cash kasbon payments − cash supplier payments. No opening balance until shifts exist.
- Receivables and payables.
- Stock losses.
- Activity log (includes voided records).
- Category filter only on product-based reports: category sales, top/slow products, stock value, stock losses.
- Category sales and top products use the category at sale time (sale line snapshot); slow movers, stock value, and stock losses use the product's current category.
- Voided sales, purchases, and payments are excluded from all totals. How a void on a later day is dated depends on the report:
  - Sales and profit, category, and product reports: a voided sale is removed from its original sale date, even when voided on a later day. These reports only ever show valid sales.
  - Cash reports (cash vs QRIS vs transfer, daily cash flow) follow the date money moved: a sale's money in stays on the sale date and the refund is money out on the void date. Voided customer and supplier payments work the same way (payment on its date, reversal on the void date). This keeps each day's drawer count correct.
  - Activity report: voids appear on the void date.
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
| Pengaturan | Pengguna (PIN); Profil Toko, pembulatan, lebar nota, folder nota (PIN); Ubah PIN; Cadangan Data (owner only, hidden from cashiers); app version in the footer |

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
- `sessions`(user_id, token_hash, expires_at, last_seen_at, locked_at) — expires after 12 h of inactivity; `locked_at` set while the screen is locked
- `settings`(key, value)
- `audit_logs`(user_id, approved_by, entity, entity_id, action, old_value, new_value)

### 9.2 Catalog
- `categories`(name, is_default, active)
- `products`(code, name, category_id, type, base_unit, pricing_factor, cost_price, stock, active)
- `product_units`(product_id, name, parent_unit_id, level, isi, cost_price, sell_price, active) — pyramid rows (4.1.1); `factor` and `is_base` are computed, not stored

### 9.3 Sales
- `sales`(number, cashier_id, customer_id, status, total, rounding_amount, paid_total, change_amount, debt_amount, completed_at, voided_at, voided_by, void_reason, receipt_count, receipt_file)
  - `id` is the client UUID. `customer_id` is added with customers in Stage 4.
  - `receipt_count`: receipts generated so far (every one after the first is "SALINAN"); `receipt_file`: last saved receipt PDF.
  - `number`: `TRX-YYYYMMDD-NNNN`, nullable while held.
  - `status`: `held` | `completed` | `voided`.
  - `total` is after rounding.
- `sale_items`(sale_id, line_no, product_id, unit_id, product_code, product_name, category_id, category_name, unit_name, qty_base, unit_factor, unit_price, cost_price, pricing_factor, subtotal, cost_total)
- `sale_payments`(sale_id, method, amount) — `method`: `cash` | `qris`; cash `amount` is the cash received, change is `sales.change_amount`

### 9.4 Customers and receivables
- `customers`(name, phone, note, active)
- `receivables`(customer_id, sale_id, amount, remaining, status) — `status`: `open` | `paid` | `void`; one per sale (`sale_id` unique); `remaining = amount - sum(active allocations)`
- `customer_payments`(number, customer_id, method, amount, amount_received, change_amount, balance_after, user_id, status, voided_at, voided_by, void_reason, receipt_count, receipt_file) — `id` is the client UUID; `number` `BYR-YYYYMMDD-NNNN`; `amount` is the applied amount; `status`: `active` | `voided`
- `payment_allocations`(payment_id, receivable_id, amount, remaining_after) — `remaining_after` is the receipt snapshot
- `sales` gains `customer_id` and `customer_balance_after` (customer's remaining kasbon after the sale, for the receipt).

### 9.5 Suppliers and purchases
- `suppliers`(name, phone, note, active)
- `purchases`(number, supplier_id, date, total, paid_amount, remaining, status, voided_at, voided_by, void_reason, user_id, note) — `id` is the client UUID; `number` `BLI-YYYYMMDD-NNNN` (local date of recording, same rules as TRX); `date` is the purchase (invoice) local day; `status`: `completed` | `voided`; `remaining = total - sum(allocations of active payments)`, `paid_amount = total - remaining`
- `purchase_items`(purchase_id, line_no, product_id, unit_id, product_code, product_name, unit_name, qty_base, unit_factor, buy_price, subtotal, pricing_factor, old_cost_price, new_cost_price) — `buy_price` is for `unit_factor` base units; `subtotal = round(qty_base * buy_price / unit_factor)`; cost prices per `pricing_factor` base units
- `supplier_payments`(number, supplier_id, method, amount, initial_purchase_id, user_id, status, voided_at, voided_by, void_reason) — `id` is the client UUID (server UUID for an initial payment); `number` `BYH-YYYYMMDD-NNNN`; `initial_purchase_id` set on a purchase's initial payment; `status`: `active` | `voided`
- `supplier_allocations`(payment_id, purchase_id, amount)

### 9.6 Stock
- `stock_adjustments`(product_id, qty_change, reason, note, cost_price, user_id)
- `stock_movements`(product_id, qty_change, type, ref_id, user_id) — `type`: `sale` | `void` | `purchase` | `purchase_void` | `adjustment`
- `stock_opnames`(category_id, status, started_at, closed_at, user_id, closed_by) — `status`: `open` | `completed` | `cancelled`; `closed_at`/`closed_by` set on complete or cancel
- `stock_opname_items`(opname_id, product_id, system_qty_at_start, counted_qty, adjustment_id) — `counted_qty` null until counted (uncounted items are skipped on completion); `adjustment_id` is the `opname` adjustment written on completion when the delta is not 0

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
- `GET auth/users`: no auth; login tiles: active users only, `{ users: [{ id, name, role }] }`. Never usernames or inactive users.
- `POST auth/login` `{ userId, pin }`, `POST auth/logout`, `POST auth/recover` (username + recovery code)
- `GET auth/me` -> `{ user, locked }`, `PUT auth/me/pin`
- `POST auth/lock`, `POST auth/unlock` `{ pin }` (same user)
- `POST auth/approve` `{ pin, scope, targetId?, ownerId? }` -> `{ token, expiresAt, ownerName }` (`ownerId` required when several owners are active); scopes: actions `sale.void`, `payment.void`, `product.price`, `product.deactivate`, `category.manage`, `purchase.void`, `purchase.cost`, `supplier-payment.void`; menus `laporan`, `pengguna`, `profil-toko`, `impor`
- `POST auth/approve/release` `{ token }` (leaving a PIN menu)

### Users (PIN)
- `GET users`, `POST users`, `PUT users/:id`
- `PUT users/:id` accepts `name`, `active`, and `pin` (temporary PIN; cashier targets only).

### Products and categories
- `GET products` (q, categoryId, status `active|inactive|all` default active, page, limit <= 100) -> `{ products, total, page, limit }`. Every word of `q` must appear in the code or name; exact code match first.
- `GET products/by-code/:code` (active only, ignoring case), `GET products/:id`
- `POST products` (optional `initialStock` -> stock adjustment `lainnya`, note "Stok awal"), `PUT products/:id` (full field set; `units` is the full set of active rows: rows with `id` update, without `id` are added, left-out rows are deactivated), `PATCH products/:id/active`
  - `unitMode` picks the shape of `units` (4.1.1). `pyramid`: ordered level 1 first, each row the child of the one before it, `costPrice` on the first row only, product `costPrice` left out. `flat`: independent rows with `isi` = factor to the stock unit, exactly one `isBase`, cost on the product. Response units carry `level`, `parentUnitId`, `isi`, computed `factor`, `costPrice`, and `isBase` (deepest level).
  - A stock level in a response (products, movements, stock value and product reports) comes with `unitChain` (levels top-down, empty for flat products) for the multi-unit display.
- Cashier approval rules for products: see 6.5.
- Import (PIN menu `impor`; rules in 6.5 "Import"):
  - `GET products/import/template` -> `Template-Impor-Barang.xlsx`
  - `POST products/import/preview` `{ fileName, contentBase64 }` (.xlsx or .csv) -> `{ rows: [{ row, values, product | null, errors }], total, valid, invalid }`; saves nothing
  - `POST products/import` (same body) -> 201 `{ imported }`; 400 `IMPORT_HAS_ERRORS` if any row has an error (nothing saved)
  - An unreadable file, a missing required column, no data rows, or too many rows -> 400 `IMPORT_FILE_INVALID`
- `GET categories`, `POST categories` (PIN), `PUT categories/:id` (PIN; default categories cannot be deactivated)

### Sales
- `POST sales` `{ id (client UUID), lines: [{ productId, unitId, qtyBase }], cash, qris, expectedTotal }` -> `{ sale, warnings }`. The server prices every line from current data; if its rounded total differs from `expectedTotal` it refuses with 409 `TOTAL_CHANGED`. `warnings` lists products now below zero stock. Until Stage 4, underpayment is refused (400 `UNDERPAID`).
- `POST sales/held`, `GET sales/held`, `DELETE sales/held/:id`, `DELETE sales/held?before=YYYY-MM-DD` (bulk-delete "kemarin" and older)
- `POST sales/held/:id/resume` -> `{ lines: [{ product, unitId, qtyBase, heldUnitPrice }], removed: [names] }`; removes the held sale (not audit-logged: it goes back into the cart).
- `GET sales` (from, to = local days, default today; q = number, product code or name; status `completed|voided|all`; page, limit), `GET sales/:id`
- `POST sales/:id/receipt` (save PDF to receipt folder as `<TRX>.pdf`; later receipts `<TRX>-SALINAN.pdf`)
- `POST sales/:id/receipt/open` (open saved PDF in default viewer), `POST receipts/open-folder`
- `GET sales/:id/receipt.pdf` (download)
- `POST sales/:id/void` (PIN, action `sale.void` on this sale) `{ reason: salah_input|pembeli_batal|lainnya, note? }` (note required for `lainnya`)

### Customers and kasbon
- `GET customers` (q, status, page, limit; each with `balance`), `GET customers/:id`, `POST customers`, `PUT customers/:id` (name, phone, note, active), `GET customers/:id/ledger`
- `GET receivables` (customerId, status `open|all`; oldest first)
- `POST customer-payments` `{ id (client UUID), customerId, receivableIds, method, amount }` (`amount` = cash received or QRIS amount), `GET customer-payments/:id`
- `POST customer-payments/:id/receipt`, `POST customer-payments/:id/receipt/open`, `GET customer-payments/:id/receipt.pdf`
- `POST customer-payments/:id/void` (PIN, action `payment.void` on this payment) `{ reason, note? }` (as for sales)
- `POST sales` takes an optional `customerId`; with it, an underpayment becomes kasbon (one receivable, `debt_amount`). Without it, underpayment is refused.

### Suppliers and stock
- `GET suppliers` (q, status, withBalance, page, limit; each with `balance` = remaining debt), `GET suppliers/:id`, `POST suppliers`, `PUT suppliers/:id` (name, phone, note, active), `GET suppliers/:id/ledger` (Kartu Hutang)
- `GET payables` (supplierId; completed purchases with remaining debt, oldest first) (Daftar Hutang)
- `GET purchases` (from, to = local days of recording, supplierId, q = number or supplier name, status `completed|voided|all`, page, limit), `GET purchases/:id`
- `POST purchases` `{ id (client UUID), supplierId, date?, note?, lines: [{ productId, unitId, qtyBase, buyPrice, newCostPrice }], paidAmount, paidMethod }` -> `{ purchase }`. Changing any product's cost price needs approval for cashiers (action `purchase.cost` on this purchase id).
- `POST purchases/:id/void` (PIN, action `purchase.void`) `{ reason: salah_input|lainnya, note? }` -> `{ purchase, costReview }` (products whose cost price this purchase changed, for the owner to review)
- `GET purchases/cost-suggestion?productId=` -> `{ costPrice, pricingFactor, stock, lastBuyCost, lastBuyDate }`; the weighted average is computed per line with the shared `weightedAverageCost`
- `POST supplier-payments` `{ id (client UUID), supplierId, purchaseIds, method, amount }` (amount <= ticked total), `GET supplier-payments/:id`, `POST supplier-payments/:id/void` (PIN, action `supplier-payment.void`) `{ reason: salah_input|lainnya, note? }`
- `GET stock-adjustments` (productId, reason, page, limit), `POST stock-adjustments` `{ productId, qtyChange, reason, note? }` (note required for `lainnya`) -> `{ adjustment, warnings }`
- `GET stock-opname` (status), `POST stock-opname` `{ categoryId }` (start), `GET stock-opname/:id`, `PUT stock-opname/:id/items` `{ items: [{ productId, countedQty | null }] }`, `POST stock-opname/:id/complete` -> `{ opname, warnings }`, `POST stock-opname/:id/cancel`
- `GET stock-movements` (productId, type, from, to, page, limit; newest first, each with the product's `balanceAfter`)

### Reports (PIN)
- All need the `laporan` menu approval for cashiers.
- `GET reports/summary`, `reports/categories`, `reports/products`, `reports/stock-value`, `reports/cash`, `reports/debts`, `reports/losses`, `reports/activity`
  - Dated reports (summary, categories, products, cash, losses, activity) take `from`, `to` (local days, default today, at most 366 days; 400 `INVALID_PERIOD` / `PERIOD_TOO_LONG`). `stock-value` and `debts` are a snapshot of now.
  - `categoryId` only on categories, products, stock-value, losses; any other report refuses it (400 `VALIDATION_ERROR`). `products` takes `limit` (default 20); `activity` takes `page`, `limit`.
- `GET reports/:type/export?format=pdf|xlsx` with the same query -> file download `Laporan-<type>-<from>_<to>.<ext>` (A4 PDF; Excel workbook with a "Ringkasan" sheet plus one sheet per table, numbers as numbers).

### Settings
- `GET settings` (any user), `PUT settings` (PIN menu `profil-toko`; only sent fields change; each changed key audit-logged)
- Defaults until set: `store_name` "TOKO PODOMORO", `rounding` `none`, `receipt_width` `58`, `receipt_footer` "Terima kasih atas kunjungan Anda", `auto_lock_minutes` 5.

### Backup and restore (owner only)
- Owner session required; cashiers get 403 `OWNER_ONLY` (no approval token can stand in). Rules in 11.4.
- `GET backup` -> `TokoPodomoro_YYYY-MM-DD_HHmmss.zip` (local time)
- `POST restore` (body: the .zip, `Content-Type: application/zip`, max 1 GB) -> `{ restarting: true }`, then the server replaces the data and restarts; 400 `RESTORE_INVALID` when the zip is unusable (nothing changed)

## 11. Distribution

Stage 6. Windows only (10 / 11, 64-bit).

### 11.1 Launcher (`installer/launcher.vbs`)
- VBScript run by `wscript.exe`, so no console window. Desktop, Start Menu, and Startup shortcuts all point at it.
- Flow:
  1. Port: from `C:\ProgramData\TokoPodomoro\config.json` (`"port"`), default `4747`.
  2. If `GET http://127.0.0.1:<port>/api/health` answers `"status":"ok"`, the server already runs: only open the window. This prevents a duplicate server.
  3. Otherwise start `node\node.exe app\main.js` hidden, with `NODE_ENV=production` (data in ProgramData, section 2.1) and output to `server.log` in the data folder.
  4. Poll `/api/health` every 250 ms for up to 15 s. When it answers, open the window.
  5. Window: `msedge.exe --app=http://127.0.0.1:<port>` (Edge found via App Paths or its usual folders); if Edge is not installed, the default browser.
- Errors are shown in a message box (Indonesian):
  - The server writes a startup failure (busy port, invalid `config.json`, ...) to `startup-error.txt` in the data folder; the launcher shows that message. If two launchers start at once, the loser re-checks health first and just opens the window.
  - No answer after 15 s: ask to try again and name `server.log`.
- ASCII only (Windows Script Host reads it as ANSI); CRLF line endings (`.gitattributes`).

### 11.2 Installer (`installer/toko-podomoro.nsi`, NSIS 3)
- Requires 64-bit Windows and admin rights. Indonesian UI. Output `installer/output/TokoPodomoro-Setup-<version>.exe`.
- Installs to `C:\Program Files\TokoPodomoro\`: `launcher.vbs`, `node\node.exe` (portable Node 26 x64), `app\` (server bundle `main.js`, `drizzle\` migrations, `public\` web app, `node_modules\` with `better-sqlite3` and `pdfkit`, kept external by esbuild).
- Creates `C:\ProgramData\TokoPodomoro\` and grants local Users modify rights: the server runs as the logged-in user, not as the admin who installed it.
- Shortcuts (all users): desktop, Start Menu (app + uninstall), Startup (autostart on login).
- Upgrade: stops the running server (only the `node.exe` of this install folder), replaces `app\` and `node\`; data untouched. Migrations run on the next start (no automatic backup before migrate yet; Stage 10).
- Uninstall: stops the server, removes program files, shortcuts, and the registry entry; keeps `C:\ProgramData\TokoPodomoro\`.
- Not code-signed: Windows SmartScreen warns on first run ("More info" -> "Run anyway"); see `README.md`.

### 11.3 Building the installer
1. `pnpm installer:prepare`: builds everything and runs `installer/prepare.mjs`, which stages `installer/build/app` from `apps/server/dist` plus `better-sqlite3` and `pdfkit` and their dependencies copied from the pnpm install (versions as in `pnpm-lock.yaml`). `better-sqlite3` ships prebuilt binaries for win32-x64, so staging works on Linux too.
2. Put the Node 26 Windows x64 `node.exe` in `installer/node/`.
3. `makensis /DVERSION=<version> installer/toko-podomoro.nsi` (Windows or Linux). The script stops with an error if `node.exe` or the staged app is missing.
- `installer/build/`, `installer/node/`, and `installer/output/` are git-ignored.

### 11.4 Backup and restore
- Owner only, from Pengaturan > Cadangan Data (tab hidden from cashiers). Not an approval scope.
- Backup (`GET backup`): a zip with
  - `toko.db`: consistent copy made with SQLite's online backup (`better-sqlite3` `.backup()`), safe while the app runs;
  - `config.json`;
  - `Nota/...`: every file in the receipt folder (current `receipt_folder` setting);
  - `backup.json`: app version and time.
- Restore (`POST restore`), after the UI confirms that all current data will be replaced:
  1. Checks the zip: contains `toko.db` and `config.json`; `config.json` valid; `toko.db` opens, passes `integrity_check`, is a TOKO PODOMORO database (`users` and the migrations table), and is not from a newer app version (more applied migrations than this app has). Otherwise 400 `RESTORE_INVALID` and nothing changes.
  2. Copies the current database to `cadangan-sebelum-pulihkan\toko-podomoro_<date>_<time>.db` in the data folder.
  3. Responds, then stops the server, replaces the database (and its `-wal`/`-shm`) and `config.json`, adds back receipts into the restored `receipt_folder` (existing files are kept, paths cannot leave the folder), and starts a new server process with the same command. Pending migrations run on that start.
  4. The page waits for `/api/health` (up to 30 s) and reloads; sessions are those of the backup, so the owner usually logs in again.
- A backup is a single file meant to be copied off the PC (flashdisk). Automatic backups are Stage 10.

### 11.5 Version
- `GET health` returns `version` (root `package.json`, inlined in the bundle). The Pengaturan footer shows it.

## 12. Roadmap

Tracked with checkboxes in `../production_checklist.md`. Stages run in table order (0-5, 7, 8, 9, 6, 10); numbers are kept.

| Stage | Scope | Done when |
|---|---|---|
| 0 Foundation | Monorepo, server serving web + /api on 127.0.0.1:4747, SQLite setup, migration framework, error format, shared math + tests | One command runs app; math tests pass |
| 1 Users | Setup, login/logout, DB sessions, roles, user mgmt, recovery codes | Owner and cashier see correct menus; session survives restart |
| 2 Products | Categories, CRUD, multi-unit, bulk, search/filter, audit log, initial stock via adjustment | 100 products entered and searchable |
| 3 Cashier | Search, units, cash/QRIS, rounding, atomic save, idempotency, hold, receipt PDF (folder + download), transaction history, keyboard UX | 50 test sales, stock matches movements, receipts correct |
| 4 Kasbon | Customers, auto kasbon, payments with allocation, ledger | Balances always reconcile |
| 5 PIN & void | Approval tokens, sale void, customer payment void, auto-lock, switch user | MVP; tag `v0.1.0-mvp` |
| 7 Stock & suppliers | Purchases, cost suggestions, supplier debt, purchase and supplier payment void, adjustments, opname sessions, movement history | Stock and payables reconcile with movements/allocations |
| 8 Reports | All reports + PDF/Excel export | Totals match raw data on a seeded dataset |
| 9 Import | CSV/Excel product import (may move earlier) | 500-row file imports; invalid rows reported, none saved partially |
| 6 Distribution | Installer (NSIS), portable Node, launcher, autostart, port config, manual backup and restore, code-split web bundle | Runs on clean PC; pilot store; tag `v0.2.0-pilot` |
| 10 Deferred | See below | — |

## 13. Deferred (Stage 10)

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

## 14. Open questions

None open. Add new ones here, tagged with the stage that needs the answer; do not implement a choice without asking.
