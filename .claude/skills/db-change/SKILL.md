---
name: db-change
description: Procedure for changing the database schema or writing multi-table data. Use when adding or altering tables, columns, indexes, migrations, or any write touching stock or more than one table.
paths:
  - apps/server/**
---

# DB change

## Schema change
1. Edit the Drizzle schema in `apps/server`. Do not hand-write DDL outside migrations.
2. Every new table: `id` text UUID primary key, `created_at` not null, `active` flag or status column (no hard deletes).
3. Store money and quantities as `integer`.
4. Add foreign keys and indexes for lookup columns (codes, dates, foreign keys).
5. Run `pnpm --filter server db:generate`. Review the generated SQL.
6. Commit schema and migration together.
7. Never edit, rename, or delete a migration that has been applied or committed. Fix forward with a new migration.
8. Update `docs/design.md` section 9 if tables or columns change.

## Connection
- Keep `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every connection.

## Writes
- Wrap every multi-table write in one `db.transaction(...)`. Start the transaction in the service layer.
- Never call `DELETE` on business tables. Set `active = 0` or a void status.
- Write an `audit_logs` row in the same transaction for every data change (`user_id`, `approved_by`, `entity`, `entity_id`, `action`, `old_value`, `new_value`).

## Stock
- Never update `products.stock` directly without a `stock_movements` row.
- Insert the movement and update the cache in the same transaction: `stock = stock + qty_change`.
- Set movement `type` (`sale`, `void`, `purchase`, `adjustment`) and `ref_id` to the source row.

## Verify
- Add a test that runs the write and asserts `products.stock` equals `SUM(stock_movements.qty_change)`.
- Add a test that a failure mid-write leaves no partial rows.
