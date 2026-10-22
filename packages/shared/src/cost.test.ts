import { describe, expect, it } from 'vitest';
import {
  costFromBuyPrice,
  marginBasisPoints,
  ratioBasisPoints,
  weightedAverageCost,
} from './money';
import { formatPercentBp } from './rupiah';

describe('costFromBuyPrice', () => {
  it('converts a dus price to a per-pcs cost', () => {
    expect(costFromBuyPrice(120_000, 12, 1)).toBe(10_000);
  });

  it('keeps a per-kg price for bulk products', () => {
    expect(costFromBuyPrice(14_000, 1000, 1000)).toBe(14_000);
  });

  it('rounds .5 up', () => {
    expect(costFromBuyPrice(25_000, 10, 1)).toBe(2500);
    expect(costFromBuyPrice(10_005, 10, 1)).toBe(1001);
  });

  it('handles zero', () => {
    expect(costFromBuyPrice(0, 12, 1)).toBe(0);
  });
});

describe('weightedAverageCost', () => {
  it('averages stock on hand with the purchase', () => {
    // 10 pcs at 1.000 + 10 pcs for 12.000 -> 1.100
    expect(
      weightedAverageCost({
        stock: 10,
        costPrice: 1000,
        pricingFactor: 1,
        qtyBase: 10,
        subtotal: 12_000,
      }),
    ).toBe(1100);
  });

  it('counts negative stock as zero', () => {
    expect(
      weightedAverageCost({
        stock: -5,
        costPrice: 1000,
        pricingFactor: 1,
        qtyBase: 4,
        subtotal: 6000,
      }),
    ).toBe(1500);
  });

  it('works per kg for bulk products', () => {
    // 2 kg at 10.000/kg + 500 g for 6.000 (12.000/kg) -> 10.400/kg
    expect(
      weightedAverageCost({
        stock: 2000,
        costPrice: 10_000,
        pricingFactor: 1000,
        qtyBase: 500,
        subtotal: 6000,
      }),
    ).toBe(10_400);
  });

  it('rounds half up', () => {
    // (1*1000 + 1*1001) / 2 = 1000.5 -> 1001
    expect(
      weightedAverageCost({
        stock: 1,
        costPrice: 1000,
        pricingFactor: 1,
        qtyBase: 1,
        subtotal: 1001,
      }),
    ).toBe(1001);
  });

  it('keeps the cost when nothing is on hand or bought', () => {
    expect(
      weightedAverageCost({ stock: 0, costPrice: 700, pricingFactor: 1, qtyBase: 0, subtotal: 0 }),
    ).toBe(700);
  });
});

describe('marginBasisPoints', () => {
  it('computes the margin of a sell unit', () => {
    // sell 12.000 per pcs, cost 10.000 -> 16,67%
    expect(marginBasisPoints(12_000, 1, 10_000, 1)).toBe(1667);
  });

  it('uses the unit factor and pricing factor', () => {
    // dus of 12 for 130.000, cost 10.000/pcs -> 7,69%
    expect(marginBasisPoints(130_000, 12, 10_000, 1)).toBe(769);
    // 1 kg sells 15.000, cost 12.000/kg -> 20%
    expect(marginBasisPoints(15_000, 1000, 12_000, 1000)).toBe(2000);
  });

  it('is negative below cost and null without a price', () => {
    expect(marginBasisPoints(9000, 1, 10_000, 1)).toBe(-1111);
    expect(marginBasisPoints(0, 1, 10_000, 1)).toBeNull();
  });
});

describe('formatPercentBp', () => {
  it('formats basis points with a comma', () => {
    expect(formatPercentBp(1850)).toBe('18,5%');
    expect(formatPercentBp(1667)).toBe('16,67%');
    expect(formatPercentBp(2000)).toBe('20%');
    expect(formatPercentBp(-305)).toBe('-3,05%');
    expect(formatPercentBp(0)).toBe('0%');
  });
});

describe('ratioBasisPoints', () => {
  it('rounds half away from zero and keeps the sign', () => {
    expect(ratioBasisPoints(1, 3)).toBe(3333);
    expect(ratioBasisPoints(2, 3)).toBe(6667);
    expect(ratioBasisPoints(-1, 8)).toBe(-1250);
    expect(ratioBasisPoints(5, 5)).toBe(10_000);
    expect(ratioBasisPoints(0, 5)).toBe(0);
    expect(ratioBasisPoints(5, 0)).toBeNull();
  });
});
