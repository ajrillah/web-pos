import { docNumberSequence, formatDocNumber, localDate } from '@toko-podomoro/shared';

/**
 * Next `<PREFIX>-YYYYMMDD-NNNN` for the local day of `now`, given a lookup of the highest
 * number with that day's prefix. NNNN restarts at 0001 each day and grows past 9999.
 */
export function nextDocNumber(
  prefix: 'TRX' | 'BYR',
  now: Date,
  lastWithPrefix: (dayPrefix: string) => string | undefined,
): string {
  const day = localDate(now);
  const last = lastWithPrefix(`${prefix}-${day.replaceAll('-', '')}-`);
  return formatDocNumber(prefix, day, (last ? (docNumberSequence(last) ?? 0) : 0) + 1);
}
