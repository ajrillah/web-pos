import { describe, expect, it } from 'vitest';
import {
  createProductRequestSchema,
  pricingFactorFor,
  productCodeSchema,
  productsQuerySchema,
} from './catalog';

describe('pricingFactorFor', () => {
  it('prices bulk per 1000 base units and normal items per base unit', () => {
    expect(pricingFactorFor('bulk')).toBe(1000);
    expect(pricingFactorFor('unit')).toBe(1);
  });
});

describe('productCodeSchema', () => {
  it('accepts barcodes and typed codes, trimmed', () => {
    expect(productCodeSchema.parse(' 8991234567890 ')).toBe('8991234567890');
    expect(productCodeSchema.parse('RKK-01/A_b.2')).toBe('RKK-01/A_b.2');
  });

  it('rejects spaces, empty, and overlong codes', () => {
    expect(productCodeSchema.safeParse('A B').success).toBe(false);
    expect(productCodeSchema.safeParse('  ').success).toBe(false);
    expect(productCodeSchema.safeParse('X'.repeat(33)).success).toBe(false);
  });
});

describe('createProductRequestSchema', () => {
  const base = {
    code: 'GL1',
    name: 'Gula pasir',
    categoryId: 'c1',
    type: 'bulk',
    baseUnit: 'gram',
    costPrice: 14000,
    units: [{ name: 'kg', factor: 1000, sellPrice: 16000, isBase: true }],
  };

  it('defaults initial stock to 0', () => {
    expect(createProductRequestSchema.parse(base).initialStock).toBe(0);
  });

  it('rejects fractional money and quantities', () => {
    expect(createProductRequestSchema.safeParse({ ...base, costPrice: 1.5 }).success).toBe(false);
    expect(createProductRequestSchema.safeParse({ ...base, initialStock: 0.5 }).success).toBe(
      false,
    );
  });

  it('needs at least one unit row', () => {
    expect(createProductRequestSchema.safeParse({ ...base, units: [] }).success).toBe(false);
  });
});

describe('productsQuerySchema', () => {
  it('coerces query-string numbers and applies defaults', () => {
    expect(productsQuerySchema.parse({ page: '2' })).toEqual({
      status: 'active',
      page: 2,
      limit: 25,
    });
  });

  it('caps the page size', () => {
    expect(productsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
