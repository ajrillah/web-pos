// Local-date helpers. "Today", TRX dates, and "kemarin" use the PC's local time zone;
// timestamps are stored in UTC (docs/design.md 4.2).

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Local calendar date as `YYYY-MM-DD`. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Start of a local calendar day (`YYYY-MM-DD`) as a Date. */
export function startOfLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/** The local day after `day`, as `YYYY-MM-DD`. */
export function nextLocalDay(day: string): string {
  const start = startOfLocalDay(day);
  return localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1));
}

export const localDaySchemaPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Sale number `TRX-YYYYMMDD-NNNN`; the sequence grows past 4 digits after 9999. */
export function formatSaleNumber(day: string, sequence: number): string {
  return `TRX-${day.replaceAll('-', '')}-${pad(sequence, 4)}`;
}

/** Sequence part of a sale number, or null if it is not one. */
export function saleNumberSequence(number: string): number | null {
  const match = /^TRX-\d{8}-(\d{4,})$/.exec(number);
  return match ? Number(match[1]) : null;
}
