import { describe, expect, it } from 'vitest';
import { createSaleRequestSchema, formatUnitQty, quickCashAmounts } from './sales';

describe('quickCashAmounts', () => {
  it('starts with the exact amount, then the next banknote multiples', () => {
    expect(quickCashAmounts(37_500)).toEqual([37_500, 38_000, 40_000, 50_000]);
    expect(quickCashAmounts(3_500)).toEqual([3_500, 4_000, 5_000, 10_000]);
  });

  it('skips amounts equal to the total', () => {
    expect(quickCashAmounts(50_000)).toEqual([50_000, 60_000, 100_000]);
    expect(quickCashAmounts(100_000)).toEqual([100_000]);
  });
});

describe('formatUnitQty', () => {
  it('shows whole units and bulk fractions with a comma', () => {
    expect(formatUnitQty(3, 1)).toBe('3');
    expect(formatUnitQty(80, 40)).toBe('2');
    expect(formatUnitQty(1500, 1000)).toBe('1,5');
    expect(formatUnitQty(250, 1000)).toBe('0,25');
    expect(formatUnitQty(1, 1000)).toBe('0,001');
  });
});

describe('createSaleRequestSchema', () => {
  const sale = {
    id: '0b6f7a0e-3c1d-4a8e-9b2f-1d2e3f4a5b6c',
    lines: [{ productId: 'p', unitId: 'u', qtyBase: 2 }],
    cash: 10_000,
    qris: 0,
    expectedTotal: 7_000,
  };

  it('accepts a valid sale', () => {
    expect(createSaleRequestSchema.safeParse(sale).success).toBe(true);
  });

  it('rejects a non-UUID id, zero quantity, an empty cart, and fractional money', () => {
    expect(createSaleRequestSchema.safeParse({ ...sale, id: 'abc' }).success).toBe(false);
    expect(
      createSaleRequestSchema.safeParse({ ...sale, lines: [{ ...sale.lines[0], qtyBase: 0 }] })
        .success,
    ).toBe(false);
    expect(createSaleRequestSchema.safeParse({ ...sale, lines: [] }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ ...sale, cash: 0.5 }).success).toBe(false);
  });

  it('accepts QRIS and transfer that together stay within the total', () => {
    const paid = { ...sale, cash: 0, qris: 4_000, transfer: 3_000 };
    expect(createSaleRequestSchema.safeParse(paid).success).toBe(true);
  });

  it('rejects QRIS and transfer that together exceed the total', () => {
    const paid = { ...sale, cash: 0, qris: 4_000, transfer: 3_001 };
    expect(createSaleRequestSchema.safeParse(paid).success).toBe(false);
  });
});
