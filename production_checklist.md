# Production Checklist — TOKO PODOMORO

Spec: `docs/design.md`. Tick items only when implemented, verified (Biome, typecheck, tests), and committed.

## Stage 0 — Foundation

- [ ] pnpm workspace: `apps/server`, `apps/web`, `packages/shared`
- [ ] Shared TypeScript, Biome, and Vitest config
- [ ] Root scripts: `dev`, `build`, `start`, `test`, `typecheck`, `check`, `db:generate`, `db:migrate`
- [ ] Fastify server binds `127.0.0.1` only, default port 4747 from config file
- [ ] Busy port -> clear Indonesian error and exit
- [ ] Server serves built web app and `/api` on one port (SPA fallback for client routes)
- [ ] SQLite via better-sqlite3 with `foreign_keys = ON` and WAL
- [ ] Drizzle schema + drizzle-kit versioned SQL migrations; migrations applied on startup
- [ ] Configurable data directory (dev: local folder; prod: `C:\ProgramData\TokoPodomoro\`)
- [ ] Error format `{ error: { code, message } }` with Indonesian messages; Zod errors mapped
- [ ] Shared math: line subtotal, cost_total, half-up rounding, total rounding (none/100/500) with Vitest tests
- [ ] React + Vite + React Router + Tailwind shell renders

**Done when:** one command runs the app; math tests pass.

## Stage 1 — Users

- [ ] First-run setup: create owner, show one-time recovery code (hash in settings)
- [ ] Login with username + 6-digit PIN; logout
- [ ] Sessions in DB, httpOnly cookie; survive server restart
- [ ] `GET auth/me`; `PUT auth/me/pin`
- [ ] Roles owner/cashier; role-based menus
- [ ] User management (create, edit, deactivate)
- [ ] PIN recovery via recovery code; new code issued after use
- [ ] Audit log for user changes

**Done when:** owner and cashier see the correct menus; session survives restart.

## Stage 2 — Products

- [ ] Categories with defaults (Rokok, Sembako, Lain-lain); owner can add
- [ ] Product CRUD; code unique across all products (incl. inactive) and editable; deactivate, never delete
- [ ] Unit rows (exactly one base) used for wholesale pricing
- [ ] Bulk products (`pricing_factor = 1000`, sold via kg/liter factor 1000)
- [ ] Search by code/name, filter by category, pagination
- [ ] Audit log for product/category changes
- [ ] Initial stock entered via stock adjustment (creates movement)

**Done when:** 100 products entered and searchable.

## Stage 3 — Cashier

- [ ] Full-screen Kasir: search by code or name; "Barang tidak ditemukan"
- [ ] Unit selection, quantity edit (bulk: integer g/ml; normal: whole numbers), remove line
- [ ] Cash and/or QRIS; QRIS <= total; change from cash only
- [ ] Total rounding per setting; `rounding_amount` stored
- [ ] Atomic sale save (sale, items, payments, movements, stock cache, audit) in one transaction
- [ ] Idempotency: client UUID, duplicate rejected
- [ ] Server recomputes all totals
- [ ] Negative stock allowed with warning
- [ ] Hold (DB, no number, no reservation) / resume / delete; cancel before payment
- [ ] Sale number `TRX-YYYYMMDD-NNNN` assigned on completion, local-time date
- [ ] Receipt PDF (58/80 mm) saved to receipt folder; "Nota tersimpan" with Buka and Unduh
- [ ] "Simpan nota PDF?" prompt (Enter = yes, Esc = skip); "SALINAN" on reprint
- [ ] Riwayat Transaksi: default today; filter date/text/status; detail with Buka/Unduh
- [ ] Keyboard UX: shortcuts, F1-F12 captured in Edge, focus returns to search, large fonts

**Done when:** 50 test sales completed; stock matches movements; receipts correct.

## Stage 4 — Kasbon

- [ ] Customers: list, add (cashier allowed), edit, deactivate
- [ ] Underpayment -> kasbon dialog; pick or quick-add customer; one receivable per sale
- [ ] Customer payments (cash/QRIS) allocated to ticked receivables (oldest pre-ticked, oldest filled first, cannot exceed ticked total)
- [ ] Cash payment: amount received and change shown
- [ ] Kartu Piutang (ledger) and Daftar Piutang
- [ ] Reconciliation tests: remaining = amount - allocations; customer balance = sum of remaining

**Done when:** balances always reconcile.

## Stage 5 — PIN & void

- [ ] `POST auth/approve` -> in-memory short-lived token; `X-Approval-Token` enforced for cashier on PIN endpoints; action tokens single-use
- [ ] Owner session bypasses approval
- [ ] Void sale: stock returned via movements, receivable voided; rejected if receivable has payments
- [ ] Voided receipts marked "DIBATALKAN"
- [ ] Auto-lock (setting) and quick lock (Ctrl+L); unlock same user only; "Ganti pengguna" -> login
- [ ] Settings page: store profile, rounding, receipt width, receipt folder, auto-lock (PIN)

**Done when:** MVP complete; tag `v0.1.0-mvp` (ask before tagging).

## Stage 6 — Distribution

- [ ] Inno Setup installer with bundled portable `node.exe`
- [ ] Launcher: starts server, prevents duplicate server, opens Edge `--app=http://127.0.0.1:<port>`
- [ ] Autostart on login
- [ ] Port configurable in config file; busy-port error shown to user
- [ ] Data in `C:\ProgramData\TokoPodomoro\`; uninstall keeps data
- [ ] Manual backup (and documented restore)

**Done when:** runs on a clean PC; deployed to pilot store; tag `v0.2.0-pilot` (ask before tagging).

## Stage 7 — Stock & suppliers

- [ ] Suppliers: list, add, edit, deactivate
- [ ] Stok Masuk: purchases, no edit; cost suggestions (last buy, weighted average) and margin
- [ ] Initial paid amount creates supplier payment + allocation
- [ ] Supplier debt payments allocated to ticked purchases (oldest pre-ticked)
- [ ] Purchase void (PIN) only if no payments besides the initial one; `purchase_void` movements
- [ ] Kartu Hutang and Daftar Hutang
- [ ] Stock adjustments with reason (rusak, kedaluwarsa, hilang, opname, lainnya)
- [ ] Stock opname: physical count -> computed delta
- [ ] Stock movement history

**Done when:** stock and payables reconcile with movements/allocations.

## Stage 8 — Reports

- [ ] Sales & profit
- [ ] Per category (revenue, profit, margin, share)
- [ ] Top / slow products
- [ ] Stock value
- [ ] Negative-stock items
- [ ] Cash vs QRIS
- [ ] Daily cash flow (cash sales - change + cash kasbon payments - cash supplier payments)
- [ ] Receivables / payables
- [ ] Stock losses
- [ ] Activity log
- [ ] Category filter on all reports
- [ ] Export PDF and Excel

**Done when:** totals match raw data on a seeded dataset.

## Stage 9 — Import

- [ ] Downloadable CSV/Excel template
- [ ] Upload with validation preview (errors per row)
- [ ] Commit import in one transaction; audit logged

**Done when:** a 500-row file imports; invalid rows reported, none saved partially.

## Stage 10 — Deferred

- [ ] Safe upgrade flow: backup before migrate (required before 2nd store)
- [ ] Auto backup
- [ ] Hardware: thermal printer, barcode scanner, cash drawer
- [ ] Bulk input by weight or amount
- [ ] Quick buttons
- [ ] Discounts with PIN
- [ ] Shifts with opening cash
- [ ] Minimum stock
- [ ] Quantity-based wholesale
- [ ] WhatsApp kasbon reminder text
- [ ] Licensing (required before wide sale)

**Done when:** each item is scheduled into a stage or explicitly dropped.

## Production readiness

- [ ] Open questions in `docs/design.md` resolved
- [ ] Clean install tested on Windows 10 and Windows 11
- [ ] Safe upgrade: automatic backup before migrate; data preserved after upgrade
- [ ] Backup and restore verified end-to-end
- [ ] Power-loss test: kill process mid-sale; DB consistent after restart
- [ ] Server reachable only on 127.0.0.1 (verified from another LAN device)
- [ ] No outbound network requests (verified with network monitor)
- [ ] Stock reconciliation: `products.stock` equals sum of `stock_movements` for all products
- [ ] Receivable/payable reconciliation passes
- [ ] Receipt PDFs print correctly at 58 mm and 80 mm
- [ ] Keyboard-only walkthrough of Kasir flow completed in Edge app mode
- [ ] All UI text and errors in Indonesian; reviewed by a native speaker
- [ ] Dependency licenses reviewed for commercial distribution
- [ ] No test data left in the shipped build or database
- [ ] Version recorded (package version, git tag, visible in UI)
- [ ] Licensing implemented
- [ ] Indonesian user guide incl. recovery-code instructions
