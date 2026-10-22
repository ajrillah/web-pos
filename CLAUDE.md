# CLAUDE.md

TOKO PODOMORO (slug `toko-podomoro`): offline POS web app for Indonesian grocery stores (toko kelontong). Sold commercially.

- Full spec (source of truth): `docs/design.md`.
- UI look and locked layouts: `docs/ui-style.md` (theme "Teal Elegan").
- Roadmap and progress: `production_checklist.md` (stages 0-10 + production readiness).
- Procedures live in `.claude/skills/`: money-rules, db-change, api-endpoint, cashier-ui, ui-style, verify, stage-done.
- Items under "Open questions" in `docs/design.md` are undecided. Ask; do not pick one.

## Language

- UI text and API error messages: Indonesian.
- Code, identifiers, comments, commit messages, docs: English.

## Product constraints

- Single Windows PC. Server binds `127.0.0.1` only. Fully offline: no LAN, no CDN, no outbound requests.
- Default port `4747`, set in the config file (never in `settings`). Busy port -> clear Indonesian error.
- Data directory: `C:\ProgramData\TokoPodomoro\` in production, `./data/` in dev; `TOKO_PODOMORO_DATA_DIR` overrides (tests use it). Holds `config.json` (port) and the DB. Uninstall keeps data.
- Server runs under the logged-in Windows user, started by the launcher (not a service).
- Receipt PDFs default to `%USERPROFILE%\Documents\TokoPodomoro\Nota\<TRX>.pdf` (setting `receipt_folder`).
- Packaged with Inno Setup + bundled portable `node.exe`; launcher opens Edge `--app=http://127.0.0.1:<port>`.

## Stack

- TypeScript, Node 26 (`.nvmrc`, `engines`), pnpm workspaces.
- `apps/server`: Fastify, better-sqlite3, Drizzle ORM + drizzle-kit (versioned SQL migrations).
- `apps/web`: React, Vite, React Router, Tailwind, shadcn/ui (Radix), lucide-react, sonner, TanStack Table.
- `packages/shared`: Zod schemas, shared types, money/unit math.
- Vitest, Biome, pdfkit (PDF), exceljs (Excel).
- One port: server serves built web assets and `/api`.

## Repository layout

```
apps/server/      Fastify API + static web hosting
apps/web/         React SPA
packages/shared/  Zod schemas, types, money/unit math
docs/design.md    Full specification
docs/ui-style.md  UI design system and locked layouts
installer/        Inno Setup scripts (output/ is ignored)
```

## Server architecture

- Layers: `routes -> services -> repositories`. Routes validate with shared Zod and call services; services own rules, transactions, audit; repositories own Drizzle queries only.
- Error body: `{ "error": { "code": "UPPER_SNAKE", "message": "<Indonesian>" } }`.
- Sessions stored in DB, httpOnly cookie; survive restart; end on logout or 12 h inactivity.
- Multiple owners; each has own recovery code (`users.recovery_code_hash`). Last active owner cannot be deactivated; owners cannot deactivate themselves.
- Owner-only actions: owner session passes directly; cashier sends `X-Approval-Token` (in-memory, short-lived; action tokens single-use).
- Server recomputes every total. Client numbers are ignored.
- Client generates UUIDs for sales, purchases, payments; server rejects duplicates.

## Data rules (non-negotiable)

- Money and quantities are integers. No floats in storage or math.
- Qty stored in `products.base_unit` (stock unit: pcs, gram, ml).
- `product_units.is_base` = primary sell unit, not stock unit. Bulk: one row `kg`/`liter`, factor 1000, `is_base = true`; no per-gram price.
- `pricing_factor`: 1000 for bulk (price per kg/l), 1 for normal. `cost_price` is per `pricing_factor` base units.
- `product_units.sell_price` is the price for `factor` base units.
- Line: `subtotal = round(qty_base * unit_price / unit_factor)`, `cost_total = round(qty_base * cost_price / pricing_factor)`. Half up, 1 Rp, once per line.
- Sale total rounding setting: `none | 100 | 500`, to nearest, ties up. `sales.total` = sum(subtotals) + `rounding_amount`. QRIS limit, change, kasbon use the rounded total.
- Negative stock allowed (warning); shown in reports.
- UUID ids. No hard deletes (`active` flag or void status). `created_at` everywhere, `updated_at` on mutable tables.
- Timestamps stored UTC. "Today" and TRX date use the PC's local time zone.
- Sale items snapshot code, name, unit, prices, subtotal, cost_total.
- `stock_movements` is the stock source of truth; `products.stock` is a cache updated in the same transaction.
- SQLite: `foreign_keys = ON`, WAL. Multi-table writes in one transaction.
- Product code unique across all products, including inactive.
- `audit_logs` only for: master data (products, units, categories, customers, suppliers), users, settings, all voids, every PIN approval. Not sales or payments.
- Voided records are excluded from all report totals.
- Never edit an applied migration; add a new one.

## Roles

- `owner`, `cashier`. Cashier needs owner PIN for: all voids (sale, purchase, customer/supplier payment), reports, user management, store settings. Everything else open.

## Keyboard

- F1-F10 captured over Edge defaults; F11/F12 never used. Fallback `Alt+<number>` only for keys that fail the Stage 3 Windows test.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), English, imperative.
- Branch per stage: `stage-N-<name>`. `main` holds merged stages. Local git only, no remote.
- Never merge to `main` or create tags without asking.
- Never add pnpm release-age exceptions (`minimumReleaseAgeExclude`). If a version is too new, pin an older release instead.
- Rupiah in UI: `Rp 12.345` (dot thousands, no decimals).

## Commands (planned, defined in Stage 0)

If a script is missing, it does not exist yet.

- `pnpm dev` - server + web in dev mode
- `pnpm build` - build all packages
- `pnpm start` - run built app on 127.0.0.1
- `pnpm test` - Vitest across workspaces
- `pnpm typecheck` - `tsc --noEmit` across workspaces
- `pnpm check` - Biome lint + format check
- `pnpm db:generate` - generate migration from Drizzle schema
- `pnpm db:migrate` - apply migrations
