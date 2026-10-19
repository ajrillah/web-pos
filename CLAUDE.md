# CLAUDE.md

Offline POS web app for Indonesian grocery stores (toko kelontong). Commercial product.

- Full spec: `docs/design.md` (source of truth for behavior, tables, API, pages).
- Roadmap and progress: `production_checklist.md` (stages 0-10 + production readiness).
- Procedures live in `.claude/skills/` (money-rules, db-change, api-endpoint, cashier-ui, verify, stage-done).

## Language

- UI text and API error messages: Indonesian.
- Code, identifiers, comments, commit messages, docs: English.

## Product constraints

- Single Windows PC. Server binds `127.0.0.1` only. Fully offline: no LAN, no CDN, no external requests.
- Packaged with Inno Setup + bundled portable `node.exe`; launcher opens Edge `--app=http://127.0.0.1:<port>`.
- Database lives in `C:\ProgramData\<AppName>\`. Uninstall keeps data.

## Stack

- TypeScript everywhere, Node LTS, pnpm workspaces.
- `apps/server`: Fastify, better-sqlite3, Drizzle ORM + drizzle-kit (versioned SQL migrations).
- `apps/web`: React, Vite, React Router, Tailwind.
- `packages/shared`: Zod schemas, shared types, money/unit math.
- Tests: Vitest. Lint/format: Biome.
- One port: server serves built web assets and `/api`.

## Repository layout

```
apps/server/     Fastify API + static web hosting
apps/web/        React SPA
packages/shared/ Zod schemas, types, money/unit math
docs/design.md   Full specification
installer/       Inno Setup scripts (output/ is ignored)
```

## Server architecture

- Layers: `routes -> services -> repositories`. Routes validate (Zod from shared) and call services; services own business rules and transactions; repositories own SQL/Drizzle only.
- Error body: `{ "error": { "code": "SOME_CODE", "message": "<Indonesian text>" } }`.
- Auth: httpOnly session cookie. Owner-only actions require `X-Approval-Token` (from `POST /api/auth/approve`) when the session user is a cashier.
- Server recomputes every total; client-sent totals are ignored.
- Client generates UUIDs for sales, purchases, payments; server rejects duplicate ids (idempotency).

## Data rules (non-negotiable)

- Money and quantities are integers. No floats in storage or math.
- Quantities stored in the product base unit (pcs, gram, ml).
- `pricing_factor`: 1000 for bulk (price per kg/l), 1 for normal items.
- Line subtotal = `round(qty_base * unit_price / unit_factor)`, rounded once per line; rounding rule is a setting.
- UUID primary keys. `created_at` on every table.
- No hard deletes: `active` flag or `voided` status.
- Sale items snapshot code, name, unit, sell price, cost price, subtotal, cost_total.
- `stock_movements` is the stock source of truth; `products.stock` is a cache updated in the same transaction.
- SQLite: `foreign_keys = ON`, WAL mode. Every multi-table write in one transaction.
- Every data change writes an `audit_logs` row.
- Never edit an applied migration; add a new one.

## Roles

- `owner` and `cashier`. Cashier needs owner PIN approval for: void, reports, user management, store settings.
- Everything else is open to cashier.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), English, imperative.
- Branch per stage: `stage-N-<name>`. `main` holds merged stages. Local git only, no remote.
- Never merge to `main` or create tags without asking the user.
- Do not decide items listed under "Open questions" in `docs/design.md`; ask.
- Format Rupiah in UI as `Rp 12.345` (dot thousands separator, no decimals).

## Commands

Defined in Stage 0; if a script is missing, it does not exist yet.

- `pnpm dev` - run server + web in dev mode
- `pnpm build` - build all packages
- `pnpm start` - run built app on 127.0.0.1
- `pnpm test` - Vitest across workspaces
- `pnpm typecheck` - `tsc --noEmit` across workspaces
- `pnpm check` - Biome lint + format check
- `pnpm --filter server db:generate` - generate a migration from Drizzle schema
- `pnpm --filter server db:migrate` - apply migrations
