# Production Checklist

Spec: `docs/design.md`. Tick items only when implemented, verified (Biome, typecheck, tests), and committed.

## Stage 0 — Foundation

- [ ] pnpm workspace: `apps/server`, `apps/web`, `packages/shared`
- [ ] Shared TypeScript config, Biome config, Vitest config
- [ ] Root scripts: `dev`, `build`, `start`, `test`, `typecheck`, `check`
- [ ] Fastify server binds `127.0.0.1` only
- [ ] Server serves built web app and `/api` on one port (SPA fallback for client routes)
- [ ] SQLite via better-sqlite3 with `foreign_keys = ON` and WAL
- [ ] Drizzle schema + drizzle-kit versioned SQL migrations; migrations applied on startup
- [ ] Configurable data directory (dev: local folder; prod: `C:\ProgramData\<AppName>\`)
- [ ] Error format `{ error: { code, message } }` with Indonesian messages; Zod validation errors mapped
- [ ] Shared money/unit math (line subtotal, cost total, rounding rules) with Vitest tests
- [ ] React + Vite + React Router + Tailwind shell renders

**Done when:** one command runs the app; math tests pass.

## Stage 1 — Users

- [ ] First-run setup: create owner, show one-time recovery code
- [ ] Login with username + PIN; httpOnly session cookie; logout
- [ ] `GET /api/auth/me`; `PUT /api/auth/me/pin`
- [ ] Roles owner/cashier; role-based menus
- [ ] User management (create, edit, deactivate)
- [ ] Audit log writes for user changes

**Done when:** owner and cashier see the correct menus.

## Stage 2 — Products

- [ ] Categories with defaults (Rokok, Sembako, Lain-lain); owner can add
- [ ] Product CRUD; unique editable code; deactivate instead of delete
- [ ] Multi-unit rows (exactly one base unit)
- [ ] Bulk products (`pricing_factor = 1000`)
- [ ] Search by code/name, filter by category, pagination
- [ ] Audit log for product/category changes
- [ ] Initial stock entered via stock adjustment (creates movement)

**Done when:** 100 products entered and searchable.

## Stage 3 — Cashier

- [ ] Full-screen Kasir: search by code or name; "Barang tidak ditemukan"
- [ ] Unit selection, quantity edit, remove line
- [ ] Cash and/or QRIS; QRIS <= total; change from cash only
- [ ] Atomic sale save (sale, items, payments, movements, stock cache) in one transaction
- [ ] Idempotency: client UUID, duplicate rejected
- [ ] Server recomputes totals
- [ ] Hold / resume / delete held sale; cancel before payment
- [ ] Sale number `TRX-YYYYMMDD-NNNN`
- [ ] Server-side receipt PDF (58/80 mm); "SALINAN" on reprint
- [ ] "Simpan nota PDF?" prompt (Enter = yes, Esc = skip)
- [ ] Riwayat Transaksi: default today; filter date/text/status; save receipt copy
- [ ] Keyboard UX: shortcuts, focus returns to search, large fonts

**Done when:** 50 test sales completed; stock matches movements; receipts correct.

## Stage 4 — Kasbon

- [ ] Customers: list, add (cashier allowed), edit, deactivate
- [ ] Underpayment -> kasbon dialog; pick or quick-add customer; one receivable per sale
- [ ] Customer payments (cash/QRIS) with allocation to ticked receivables (oldest pre-ticked, oldest filled first)
- [ ] Kartu Piutang (ledger) and Daftar Piutang
- [ ] Reconciliation tests: receivable remaining = amount - allocations; customer balance = sum of remaining

**Done when:** balances always reconcile.

## Stage 5 — PIN & void

- [ ] `POST /api/auth/approve` returns short-lived approval token; `X-Approval-Token` enforced on PIN endpoints
- [ ] Void sale: stock returned via movements, receivable cancelled; rejected if receivable has payments
- [ ] Voided receipts marked "DIBATALKAN"
- [ ] Auto-lock (setting) and quick lock (Ctrl+L); unlock
- [ ] PIN reset via recovery code
- [ ] Settings: store profile, rounding rule, receipt width, auto-lock minutes (PIN)

**Done when:** MVP complete; tag `v0.1.0-mvp` (ask before tagging).

## Stage 6 — Distribution

- [ ] Inno Setup installer with bundled portable `node.exe`
- [ ] Launcher: starts server, prevents duplicate server, opens Edge `--app=http://127.0.0.1:<port>`
- [ ] Autostart on login
- [ ] Data in `C:\ProgramData\<AppName>\`; uninstall keeps data
- [ ] Manual backup (and documented restore)

**Done when:** runs on a clean PC; deployed to pilot store; tag `v0.2.0-pilot` (ask before tagging).

## Stage 7 — Stock & suppliers

- [ ] Suppliers: list, add, edit, deactivate
- [ ] Stok Masuk (purchases) with cost suggestions (last buy price, weighted average) and margin
- [ ] Supplier debt; installment payments allocated to chosen purchases
- [ ] Kartu Hutang and Daftar Hutang
- [ ] Stock adjustments with reason (rusak, kedaluwarsa, hilang, opname, lainnya)
- [ ] Stock opname: physical count -> computed delta
- [ ] Stock movement history

**Done when:** purchases, payments, and adjustments reconcile with stock movements and supplier balances.

## Stage 8 — Reports

- [ ] Sales & profit
- [ ] Per category (revenue, profit, margin, share)
- [ ] Top / slow products
- [ ] Stock value
- [ ] Cash vs QRIS and expected cash
- [ ] Receivables / payables
- [ ] Stock losses
- [ ] Activity log
- [ ] Category filter on all reports
- [ ] Export PDF and Excel

**Done when:** every report matches hand-computed figures on a seeded dataset; exports open correctly.

## Stage 9 — Import

- [ ] Downloadable CSV/Excel template
- [ ] Upload with validation preview (errors per row)
- [ ] Commit import in one transaction; audit logged

**Done when:** a 500-row file imports with correct preview errors and no partial writes.

## Stage 10 — Deferred

- [ ] Migrations in production use (required before 2nd store)
- [ ] Auto backup
- [ ] Hardware: thermal printer, barcode scanner, cash drawer
- [ ] Bulk input by weight or amount
- [ ] Quick buttons
- [ ] Discounts with PIN
- [ ] Shifts
- [ ] Minimum stock
- [ ] Quantity-based wholesale
- [ ] WhatsApp kasbon reminder text
- [ ] Licensing (required before wide sale)

## Production readiness

- [ ] Open questions in `docs/design.md` resolved
- [ ] Clean install tested on Windows 10 and Windows 11
- [ ] Upgrade install over existing data preserves data and runs migrations safely
- [ ] Pre-migration backup taken automatically on upgrade
- [ ] Backup and restore verified end-to-end
- [ ] App makes no outbound network requests (verified with network monitor)
- [ ] Server reachable only on 127.0.0.1 (verified from another LAN device)
- [ ] Power-loss test: kill process mid-sale; DB consistent after restart
- [ ] Stock reconciliation check: `products.stock` equals sum of `stock_movements` for all products
- [ ] Receivable/payable reconciliation check passes
- [ ] Performance acceptable with 5,000 products and 100,000 sales
- [ ] Receipt PDFs print correctly at 58 mm and 80 mm
- [ ] All UI text and error messages in Indonesian; reviewed by a native speaker
- [ ] Keyboard-only walkthrough of Kasir flow completed
- [ ] Logs written to data directory with rotation; no PINs or secrets in logs
- [ ] Third-party dependency licenses reviewed for commercial distribution
- [ ] App version visible in UI
- [ ] Licensing implemented
- [ ] User guide (Indonesian) and support/recovery-code instructions for store owners
