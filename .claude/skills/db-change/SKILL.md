---
name: db-change
description: Procedure for changing the database schema or writing multi-table data. Use when adding or altering tables, columns, indexes, migrations, or any write touching stock or more than one table.
paths:
  - apps/server/**
---

# DB change

## Schema change
1. Edit the Drizzle schema in `apps/server`. Do not hand-write DDL outside migrations.
2. Every table: `id` text UUID primary key, `created_at` not null. Mutable tables: `updated_at`. Use `active` or a status column; no hard deletes.
3. Store money and quantities as `integer`. Store timestamps as UTC.
4. Add foreign keys and indexes for lookup columns (codes, dates, foreign keys). Keep `products.code` unique across all rows.
5. Run `pnpm db:generate`. Review the generated SQL.
6. Commit schema and migration together.
7. Never edit, rename, or delete an applied or committed migration. Fix forward with a new one.
8. Update `docs/design.md` section 9 when tables or columns change.

## Connection
- Set `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every connection.

## Writes
- Wrap every multi-table write in one `db.transaction(...)`, started in the service layer.
- Never `DELETE` business rows. Set `active = 0` or a void status.
- Set `updated_at` on every update.
- Write an `audit_logs` row in the same transaction only for: master data (products, units, categories, customers, suppliers), users, settings, all voids, PIN approvals. Not for sales, payments, purchases, adjustments, opname.

## Stock
- Never change `products.stock` without a `stock_movements` row.
- Insert the movement and update the cache in the same transaction: `stock = stock + qty_change`.
- Set `type` (`sale`, `void`, `purchase`, `purchase_void`, `adjustment`) and `ref_id` to the source row.
- Opname completion: `delta = counted_qty - system_qty_at_start`, written as an `opname` adjustment against current stock.

## Voids
- Set status `voided`, `voided_at`, `voided_by`; never delete.
- Payment void: reverse its allocations and restore `remaining` on receivables/purchases in the same transaction.
- Purchase void: also void its initial payment and allocations; reverse stock with `purchase_void`. Do not revert `cost_price`.
- Allow negative stock; return a warning, do not block.

## Verify
- Test that `products.stock` equals `SUM(stock_movements.qty_change)` after the write.
- Test that a failure mid-write leaves no partial rows.
