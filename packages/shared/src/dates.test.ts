import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  formatSaleNumber,
  localDate,
  nextLocalDay,
  saleNumberSequence,
  startOfLocalDay,
} from './dates';

// The shop PC runs in WIB (UTC+7); local dates must follow it, not UTC.
beforeAll(() => {
  vi.stubEnv('TZ', 'Asia/Jakarta');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('localDate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    expect(localDate(new Date('2026-10-22T16:59:59.999Z'))).toBe('2026-10-22');
    expect(localDate(new Date('2026-10-22T17:00:00.000Z'))).toBe('2026-10-23');
  });
});

describe('startOfLocalDay and nextLocalDay', () => {
  it('return local midnight and roll over months and years', () => {
    expect(startOfLocalDay('2026-10-23').toISOString()).toBe('2026-10-22T17:00:00.000Z');
    expect(nextLocalDay('2026-10-31')).toBe('2026-11-01');
    expect(nextLocalDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('formatSaleNumber', () => {
  it('pads to 4 digits and grows past 9999', () => {
    expect(formatSaleNumber('2026-10-22', 1)).toBe('TRX-20261022-0001');
    expect(formatSaleNumber('2026-10-22', 9999)).toBe('TRX-20261022-9999');
    expect(formatSaleNumber('2026-10-22', 10000)).toBe('TRX-20261022-10000');
  });

  it('round-trips through saleNumberSequence', () => {
    expect(saleNumberSequence('TRX-20261022-0042')).toBe(42);
    expect(saleNumberSequence('TRX-20261022-10000')).toBe(10000);
    expect(saleNumberSequence('X-1')).toBeNull();
  });
});
