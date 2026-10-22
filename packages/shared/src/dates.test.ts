import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  docNumberSequence,
  formatPaymentNumber,
  formatSaleNumber,
  localDate,
  nextLocalDay,
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

  it('round-trips through docNumberSequence', () => {
    expect(docNumberSequence('TRX-20261022-0042')).toBe(42);
    expect(docNumberSequence('TRX-20261022-10000')).toBe(10000);
    expect(docNumberSequence('X-1')).toBeNull();
  });

  it('formats customer payment numbers the same way', () => {
    expect(formatPaymentNumber('2026-10-22', 7)).toBe('BYR-20261022-0007');
    expect(docNumberSequence('BYR-20261022-0007')).toBe(7);
  });
});
