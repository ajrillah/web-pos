import { describe, expect, it } from 'vitest';
import {
  chainCosts,
  chainFactors,
  formatStockPyramid,
  type PyramidRow,
  unitFactors,
} from './units';

/** Ball > Slop > Bungkus: 1 Ball = 20 Slop, 1 Slop = 10 Bungkus. */
const rokok: PyramidRow[] = [
  { id: 'ball', parentUnitId: null, isi: 1 },
  { id: 'slop', parentUnitId: 'ball', isi: 20 },
  { id: 'bungkus', parentUnitId: 'slop', isi: 10 },
];

describe('unitFactors', () => {
  it('counts base units down a pyramid chain', () => {
    const factors = unitFactors(rokok);
    expect(factors.get('ball')).toBe(200);
    expect(factors.get('slop')).toBe(10);
    expect(factors.get('bungkus')).toBe(1);
  });

  it('keeps a flat row at its own isi (pre-MS1 products)', () => {
    const factors = unitFactors([
      { id: 'pcs', parentUnitId: null, isi: 1 },
      { id: 'dus', parentUnitId: null, isi: 40 },
      { id: 'kg', parentUnitId: null, isi: 1000 },
    ]);
    expect(factors.get('pcs')).toBe(1);
    expect(factors.get('dus')).toBe(40);
    expect(factors.get('kg')).toBe(1000);
  });

  it('treats a single-level pyramid as the stock unit', () => {
    expect(unitFactors([{ id: 'pcs', parentUnitId: null, isi: 1 }]).get('pcs')).toBe(1);
  });

  it('stops on a cycle in corrupted data', () => {
    const factors = unitFactors([
      { id: 'a', parentUnitId: 'b', isi: 2 },
      { id: 'b', parentUnitId: 'a', isi: 3 },
    ]);
    expect(factors.get('a')).toBe(3 * 2 * 3 * 2 * 3);
  });
});

describe('chainFactors', () => {
  it('is 1 for a single level', () => {
    expect(chainFactors([1])).toEqual([1]);
  });

  it('multiplies the levels below each level', () => {
    expect(chainFactors([1, 20, 10])).toEqual([200, 10, 1]);
  });

  it('handles five levels', () => {
    expect(chainFactors([1, 2, 3, 4, 5])).toEqual([120, 60, 20, 5, 1]);
  });
});

describe('chainCosts', () => {
  it('keeps the entered cost at level 1', () => {
    expect(chainCosts(100_000, [1])).toEqual([100_000]);
  });

  it('divides down the chain', () => {
    expect(chainCosts(100_000, [1, 20, 10])).toEqual([100_000, 5000, 500]);
  });

  it('rounds up at every step', () => {
    // 10_000 / 7 = 1428.57 -> 1429; 1429 / 3 = 476.33 -> 477.
    expect(chainCosts(10_000, [1, 7, 3])).toEqual([10_000, 1429, 477]);
  });

  it('never drops to zero', () => {
    expect(chainCosts(1, [1, 1000])).toEqual([1, 1]);
  });
});

describe('formatStockPyramid', () => {
  const chain = [
    { name: 'Ball', factor: 200 },
    { name: 'Slop', factor: 10 },
    { name: 'Bungkus', factor: 1 },
  ];

  it('breaks a quantity down top-down', () => {
    expect(formatStockPyramid(3806, chain, 'Bungkus')).toBe('19 Ball 6 Bungkus');
    expect(formatStockPyramid(396, chain, 'Bungkus')).toBe('1 Ball 19 Slop 6 Bungkus');
  });

  it('leaves out levels with a zero count', () => {
    expect(formatStockPyramid(200, chain, 'Bungkus')).toBe('1 Ball');
    expect(formatStockPyramid(201, chain, 'Bungkus')).toBe('1 Ball 1 Bungkus');
  });

  it('shows zero in the deepest unit', () => {
    expect(formatStockPyramid(0, chain, 'Bungkus')).toBe('0 Bungkus');
  });

  it('keeps one leading minus for negative stock', () => {
    expect(formatStockPyramid(-12, chain, 'Bungkus')).toBe('-1 Slop 2 Bungkus');
  });

  it('formats thousands with a dot', () => {
    expect(formatStockPyramid(400_000, chain, 'Bungkus')).toBe('2.000 Ball');
  });

  it('falls back to the stock unit for a flat product', () => {
    expect(formatStockPyramid(1250, [], 'gram')).toBe('1.250 gram');
    expect(formatStockPyramid(-3, [], 'pcs')).toBe('-3 pcs');
  });

  it('refuses a non-integer quantity', () => {
    expect(() => formatStockPyramid(1.5, [], 'pcs')).toThrow(RangeError);
  });
});
