import { describe, expect, it } from 'vitest';
import { lineCostTotal, lineSubtotal, mulDivRoundHalfUp, roundSaleTotal } from './money';

describe('mulDivRoundHalfUp', () => {
  it('divides exactly', () => {
    expect(mulDivRoundHalfUp(6, 10, 3)).toBe(20);
  });

  it('rounds down below .5', () => {
    expect(mulDivRoundHalfUp(1, 4, 10)).toBe(0);
  });

  it('rounds .5 up', () => {
    expect(mulDivRoundHalfUp(1, 5, 10)).toBe(1);
    expect(mulDivRoundHalfUp(1, 1500, 1000)).toBe(2);
  });

  it('rounds above .5 up', () => {
    expect(mulDivRoundHalfUp(1, 6, 10)).toBe(1);
  });

  it('returns zero for zero quantity', () => {
    expect(mulDivRoundHalfUp(0, 12_000, 1000)).toBe(0);
  });

  it('rejects negative inputs', () => {
    expect(() => mulDivRoundHalfUp(-1, 10, 1)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(1, -10, 1)).toThrow(RangeError);
  });

  it('rejects zero or negative divisors', () => {
    expect(() => mulDivRoundHalfUp(1, 10, 0)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(1, 10, -5)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => mulDivRoundHalfUp(1.5, 10, 1)).toThrow(RangeError);
    expect(() => mulDivRoundHalfUp(1, 10, 2.5)).toThrow(RangeError);
  });

  it('rejects products beyond the safe integer range', () => {
    expect(() => mulDivRoundHalfUp(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });
});

describe('lineSubtotal', () => {
  it('prices one normal unit', () => {
    expect(lineSubtotal({ qtyBase: 1, unitPrice: 3_500, unitFactor: 1 })).toBe(3_500);
  });

  it('prices a multi-piece unit (slop of 10 at 280.000)', () => {
    expect(lineSubtotal({ qtyBase: 20, unitPrice: 280_000, unitFactor: 10 })).toBe(560_000);
  });

  it('prices bulk grams against a per-kg price', () => {
    // 250 g of rice at Rp 14.000/kg = Rp 3.500
    expect(lineSubtotal({ qtyBase: 250, unitPrice: 14_000, unitFactor: 1000 })).toBe(3_500);
  });

  it('rounds bulk fractions half up', () => {
    // 333 g at Rp 15.000/kg = 4995
    expect(lineSubtotal({ qtyBase: 333, unitPrice: 15_000, unitFactor: 1000 })).toBe(4_995);
    // 1 g at Rp 500/kg = 0.5 -> 1
    expect(lineSubtotal({ qtyBase: 1, unitPrice: 500, unitFactor: 1000 })).toBe(1);
    // 1 g at Rp 499/kg = 0.499 -> 0
    expect(lineSubtotal({ qtyBase: 1, unitPrice: 499, unitFactor: 1000 })).toBe(0);
  });

  it('handles large values', () => {
    expect(lineSubtotal({ qtyBase: 1_000_000, unitPrice: 250_000, unitFactor: 1000 })).toBe(
      250_000_000,
    );
  });
});

describe('lineCostTotal', () => {
  it('costs normal items', () => {
    expect(lineCostTotal({ qtyBase: 3, costPrice: 2_750, pricingFactor: 1 })).toBe(8_250);
  });

  it('costs bulk items per pricing factor', () => {
    // 750 ml of oil at cost Rp 17.333/liter = 12999.75 -> 13000
    expect(lineCostTotal({ qtyBase: 750, costPrice: 17_333, pricingFactor: 1000 })).toBe(13_000);
  });

  it('rounds .5 up', () => {
    expect(lineCostTotal({ qtyBase: 1, costPrice: 1_500, pricingFactor: 1000 })).toBe(2);
  });
});

describe('roundSaleTotal', () => {
  it('leaves totals unchanged with mode none', () => {
    expect(roundSaleTotal(12_345, 'none')).toEqual({ total: 12_345, roundingAmount: 0 });
  });

  it('rounds to nearest 100', () => {
    expect(roundSaleTotal(12_349, '100')).toEqual({ total: 12_300, roundingAmount: -49 });
    expect(roundSaleTotal(12_351, '100')).toEqual({ total: 12_400, roundingAmount: 49 });
  });

  it('rounds 100 ties up', () => {
    expect(roundSaleTotal(12_350, '100')).toEqual({ total: 12_400, roundingAmount: 50 });
  });

  it('rounds to nearest 500', () => {
    expect(roundSaleTotal(12_249, '500')).toEqual({ total: 12_000, roundingAmount: -249 });
    expect(roundSaleTotal(12_251, '500')).toEqual({ total: 12_500, roundingAmount: 249 });
  });

  it('rounds 500 ties up', () => {
    expect(roundSaleTotal(12_250, '500')).toEqual({ total: 12_500, roundingAmount: 250 });
  });

  it('keeps exact multiples', () => {
    expect(roundSaleTotal(12_500, '500')).toEqual({ total: 12_500, roundingAmount: 0 });
    expect(roundSaleTotal(0, '100')).toEqual({ total: 0, roundingAmount: 0 });
  });

  it('rounds small totals down to zero', () => {
    expect(roundSaleTotal(49, '100')).toEqual({ total: 0, roundingAmount: -49 });
  });

  it('rejects negative sums', () => {
    expect(() => roundSaleTotal(-1, '100')).toThrow(RangeError);
  });
});
