import { describe, expect, it } from 'vitest';
import { formatInteger, formatRupiah } from './rupiah';

describe('formatRupiah', () => {
  it('formats with dot thousands separators', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(500)).toBe('Rp 500');
    expect(formatRupiah(12_345)).toBe('Rp 12.345');
    expect(formatRupiah(1_234_567_890)).toBe('Rp 1.234.567.890');
  });

  it('prefixes negatives with a minus sign', () => {
    expect(formatRupiah(-12_345)).toBe('-Rp 12.345');
  });

  it('rejects non-integers', () => {
    expect(() => formatRupiah(1.5)).toThrow(RangeError);
  });
});

describe('formatInteger', () => {
  it('groups thousands with dots, keeping the sign', () => {
    expect(formatInteger(0)).toBe('0');
    expect(formatInteger(25_000)).toBe('25.000');
    expect(formatInteger(-1_500)).toBe('-1.500');
  });

  it('rejects non-integers', () => {
    expect(() => formatInteger(0.5)).toThrow(RangeError);
  });
});
