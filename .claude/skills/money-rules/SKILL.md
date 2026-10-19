---
name: money-rules
description: Rules for money, quantity, unit conversion, rounding, and sale snapshots. Use when writing or reviewing any price, total, quantity, stock, or cost calculation.
paths:
  - packages/shared/**
  - apps/server/**
---

# Money rules

## Representation
- Store and compute money as integer Rupiah. Never use floats, decimals, or `toFixed` in storage or math.
- Store quantities as integers in the product base unit (pcs, gram, ml).
- Reject non-integer input at the Zod boundary (`z.number().int()`).

## Units and bulk
- `pricing_factor` = 1 for normal items, 1000 for bulk items (price per kg / per liter).
- Convert entered qty to base: `qty_base = qty_entered * unit_factor`.
- Line subtotal: `round(qty_base * unit_price / unit_factor)`.
- Multiply before dividing. Keep intermediate products within `Number.MAX_SAFE_INTEGER`; assert it.

## Rounding
- Round once per line, at the end of the line calculation. Never round intermediate steps.
- Sale total = sum of already-rounded line subtotals. Do not add total-level rounding unless the spec defines it.
- Read the rounding rule from settings; implement it in `packages/shared` only, as a pure function.
- Never duplicate math in server or web; import from `packages/shared`.

## Snapshots
- On sale completion, copy into `sale_items`: `product_code`, `product_name`, `unit_name`, `unit_factor`, `unit_price`, `cost_price`, `pricing_factor`, `subtotal`, `cost_total`.
- Never recompute historical sales from current product data; read the snapshot.

## Payments
- QRIS amount <= total. Change comes from cash only.
- `change_amount = max(0, cash + qris - total)`, bounded by the cash amount.
- `debt_amount = max(0, total - cash - qris)`; > 0 requires a customer (kasbon).

## Tests
- Add Vitest cases for every new math function: zero, one unit, bulk grams, large values, each rounding mode, boundary .5 cases.
