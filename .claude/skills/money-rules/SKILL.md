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
- Store quantities as integers in `products.base_unit`, the stock unit (pcs, gram, ml).
- Reject non-integer input at the Zod boundary (`z.number().int()`).
- MVP qty input: bulk in integer grams/ml; normal items whole units only.

## Units and bulk
- `pricing_factor`: 1 for normal items, 1000 for bulk (price per kg / liter).
- `products.cost_price` is the cost for `pricing_factor` base units.
- `product_units.sell_price` is the price for `factor` base units. `is_base` = primary sell unit, not stock unit.
- Bulk: exactly one row `kg`/`liter`, factor 1000, `is_base = true`. No per-gram/ml price.
- `subtotal = round(qty_base * unit_price / unit_factor)`.
- `cost_total = round(qty_base * cost_price / pricing_factor)`.
- Multiply before dividing; assert intermediates stay within `Number.MAX_SAFE_INTEGER`.

## Rounding
- Line: round half up to 1 Rp, once, at the end. Never round intermediates.
- Sale total: sum line subtotals, then apply setting `none | 100 | 500` to nearest; ties round up.
- `rounding_amount = rounded - sum(subtotals)` (may be negative). Store `sales.total` after rounding.
- Implement all math as pure functions in `packages/shared`; never duplicate it in server or web.

## Payments
- Use the rounded total for QRIS limit, change, and kasbon.
- QRIS <= total. Change from cash only: `change = max(0, cash + qris - total)`, never > cash.
- `debt_amount = max(0, total - cash - qris)`; > 0 requires a customer (kasbon receivable).
- Allocations never exceed the ticked receivables/purchases total; fill oldest first. Count active (non-voided) payments only.

## Snapshots
- On completion copy into `sale_items`: `product_code`, `product_name`, `unit_name`, `unit_factor`, `unit_price`, `cost_price`, `pricing_factor`, `subtotal`, `cost_total`.
- Never recompute historical sales from current product data; read the snapshot.

## Tests
- Add Vitest cases per math function: zero, one unit, bulk grams, large values, .5 boundaries, each total rounding mode, ties, negative `rounding_amount`.
