# Production Checklist — TOKO PODOMORO

Spec: `docs/design.md`. Tick items only when implemented, verified (Biome, typecheck, tests), and committed.

Order: stages run 0-5, 7, 8, 9, 6, 10. Stage numbers are kept; Distribution (6) moved after Import (9).

## Stage 0 — Foundation

- [x] pnpm workspace: `apps/server`, `apps/web`, `packages/shared`
- [x] Node 26 pinned (`.nvmrc`, `engines`)
- [x] Shared TypeScript and Biome config
- [x] Vitest runs in all packages
- [x] Root scripts: `dev`, `build`, `start`, `test`, `typecheck`, `check`, `db:generate`, `db:migrate`
- [x] Fastify server binds `127.0.0.1` only, default port 4747 from config file
- [x] Busy port -> clear Indonesian error and exit
- [x] Server serves built web app and `/api` on one port (SPA fallback for client routes)
- [x] SQLite via better-sqlite3 with `foreign_keys = ON` and WAL
- [x] Drizzle schema + drizzle-kit versioned SQL migrations; migrations applied on startup
- [x] Data directory resolution (`TOKO_PODOMORO_DATA_DIR` > prod `C:\ProgramData\TokoPodomoro\` > dev `./data/`); `config.json` created with `{ "port": 4747 }`
- [x] Error format `{ error: { code, message } }` with Indonesian messages; Zod errors mapped
- [x] Shared math: line subtotal, cost_total, half-up rounding, total rounding (none/100/500, ties up, negative `rounding_amount`) with Vitest tests
- [x] React + Vite + React Router + Tailwind shell renders

**Done when:** one command runs the app; math tests pass.

## Stage 1 — Users

- [x] First-run setup: create owner, show one-time recovery code (`users.recovery_code_hash`)
- [x] Login with username + 6-digit PIN; logout
- [x] Sessions in DB, httpOnly cookie; survive restart; expire after 12 h inactivity
- [x] `GET auth/me`; `PUT auth/me/pin`
- [x] Roles owner/cashier; role-based menus
- [x] User management (create, edit, deactivate); multiple owners allowed
- [x] Last active owner cannot be deactivated; owners cannot deactivate themselves
- [x] PIN recovery via the owner's recovery code; new code issued after use
- [x] Owner resets a cashier's PIN to a temporary PIN; `must_change_pin` forces a change at next login
- [x] Audit log for user changes

**Done when:** owner and cashier see the correct menus; session survives restart.

## Stage 2 — Products

- [x] Categories with defaults (Rokok, Sembako, Lain-lain); owner can add
- [x] Product CRUD; code unique across all products (incl. inactive) and editable; deactivate, never delete
- [x] Unit rows with exactly one `is_base` (primary sell unit); wholesale pricing via unit rows
- [x] Bulk products: stock in gram/ml, single `kg`/`liter` row factor 1000, `pricing_factor = 1000`
- [x] Search by code/name, filter by category, pagination
- [x] Audit log for product, unit, and category changes
- [x] Initial stock entered via stock adjustment (creates movement)

**Done when:** 100 products entered and searchable.

## Stage 3 — Cashier

- [x] Full-screen Kasir: search by code or name; "Barang tidak ditemukan"
- [x] Unit selection, quantity edit (bulk: integer g/ml; normal: whole numbers), remove line
- [x] Cash and/or QRIS against rounded total; QRIS <= total; change from cash only
- [x] Total rounding per setting; `total` stored after rounding; `rounding_amount` stored
- [x] Atomic sale save (sale, items, payments, movements, stock cache) in one transaction
- [x] Idempotency: client UUID, duplicate rejected
- [x] Server recomputes all totals
- [x] Negative stock allowed with warning
- [x] Hold (DB, no number, no reservation) / resume with refreshed prices and removal notice for deactivated products / delete; cancel before payment
- [x] Sale number `TRX-YYYYMMDD-NNNN` on completion; daily reset from 0001 (local date); 5+ digits after 9999
- [x] Receipt PDF (58/80 mm) saved to receipt folder; "Nota tersimpan" with Buka, Buka folder, Unduh
- [x] "Simpan nota PDF?" prompt (Enter = yes, Esc = skip); "SALINAN" on reprint
- [x] Riwayat Transaksi: default today; filter date/text/status; detail with Buka/Buka folder/Unduh
- [x] Keyboard UX: shortcuts, focus returns to search, large fonts
- [x] F1-F10 captured with `preventDefault` (no F11/F12); Alt+number fallback can be switched on per key (manual Windows test: Stage 6)

**Done when:** 50 test sales completed; stock matches movements; receipts correct.

## Stage 4 — Kasbon

- [x] Customers: list, add (cashier allowed), edit, deactivate; audit logged
- [x] Underpayment -> kasbon dialog; pick or quick-add customer; one receivable per sale
- [x] Customer payments (cash/QRIS) allocated to ticked receivables (oldest pre-ticked, oldest filled first, cannot exceed ticked total)
- [x] Cash payment: amount received and change shown
- [x] Kartu Piutang (ledger) and Daftar Piutang
- [x] Reconciliation tests: remaining = amount - active allocations; customer balance = sum of remaining

**Done when:** balances always reconcile.

## Stage 5 — PIN & void

- [x] `POST auth/approve` -> in-memory short-lived token; `X-Approval-Token` enforced for cashier on PIN endpoints; action tokens single-use
- [x] Owner session bypasses approval; every approval audit-logged
- [x] Void sale: stock returned via movements, receivable voided; rejected if receivable has active payments
- [x] Void customer payment (PIN): allocations reversed, receivable remaining restored
- [x] Voided receipts marked "DIBATALKAN"; all voids audit-logged
- [x] Auto-lock (default 5 min) and quick lock (Ctrl+L); unlock same user only; "Ganti pengguna" -> login
- [x] Login with user tiles + 6-digit PIN pad (keyboard also types digits); `GET auth/users` returns only id, name, role of active users (no usernames); login by user id + PIN
- [x] Settings page (PIN): store name/address/phone, receipt footer, rounding, receipt width, receipt folder, auto-lock; audit logged

**Done when:** MVP complete; tag `v0.1.0-mvp` (ask before tagging).

## Stage 7 — Stock & suppliers

- [ ] Suppliers: list, add, edit, deactivate; audit logged
- [ ] Stok Masuk: purchases, no edit; cost suggestions (last buy, weighted average) and margin
- [ ] Initial paid amount creates supplier payment + allocation
- [ ] Supplier debt payments allocated to ticked purchases (oldest pre-ticked)
- [ ] Purchase void (PIN) only if no active payments besides the initial one; voids initial payment + allocations; `purchase_void` movements; cost-price review reminder for owner
- [ ] Supplier payment void (PIN): allocations reversed, purchase remaining restored
- [ ] Kartu Hutang and Daftar Hutang
- [ ] Stock adjustments with reason (rusak, kedaluwarsa, hilang, opname, lainnya)
- [ ] Stock opname sessions: start, enter counts, complete (delta vs `system_qty_at_start` applied to current stock), cancel
- [ ] Stock movement history

**Done when:** stock and payables reconcile with movements/allocations.

## Stage 8 — Reports

- [ ] Sales & profit
- [ ] Per category (revenue, profit, margin, share)
- [ ] Top / slow products
- [ ] Stock value (negative stock counted as 0; negative items listed separately)
- [ ] Negative-stock items
- [ ] Cash vs QRIS
- [ ] Daily cash flow (cash sales - change + cash kasbon payments - cash supplier payments)
- [ ] Receivables / payables
- [ ] Stock losses
- [ ] Activity log (includes voids and approvals)
- [ ] Category filter on product-based reports only (category sales, top/slow, stock value, losses)
- [ ] Voided records excluded from all totals
- [ ] Export PDF and Excel

**Done when:** totals match raw data on a seeded dataset.

## Stage 9 — Import

- [ ] Downloadable CSV/Excel template
- [ ] Upload with validation preview (errors per row)
- [ ] Commit import in one transaction; audit logged

**Done when:** a 500-row file imports; invalid rows reported, none saved partially.

## Stage 6 — Distribution

- [ ] Inno Setup installer with bundled portable `node.exe`
- [ ] Launcher runs server under the logged-in user; prevents duplicate server; opens Edge `--app=http://127.0.0.1:<port>`
- [ ] Autostart on login
- [ ] Port configurable in config file; busy-port error shown to user
- [ ] Data in `C:\ProgramData\TokoPodomoro\`; uninstall keeps data
- [ ] Default receipt folder `%USERPROFILE%\Documents\TokoPodomoro\Nota` created on first save
- [ ] Manual backup (and documented restore)
- [ ] F-key capture verified manually in Edge `--app` mode on Windows; switch on the Alt+number fallback for any key that fails
- [ ] Revisit web bundle size: code-split routes (Vite warns the main chunk is > 500 kB)

**Done when:** runs on a clean PC; deployed to pilot store; tag `v0.2.0-pilot` (ask before tagging).

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
- [ ] Receivable/payable reconciliation passes (active allocations only)
- [ ] Receipt PDFs print correctly at 58 mm and 80 mm
- [ ] Keyboard-only walkthrough of Kasir flow completed in Edge app mode
- [ ] All UI text and errors in Indonesian; reviewed by a native speaker
- [ ] Dependency licenses reviewed for commercial distribution
- [ ] No test data left in the shipped build or database
- [ ] Version recorded (package version, git tag, visible in UI)
- [ ] Licensing implemented
- [ ] Indonesian user guide incl. recovery-code instructions
