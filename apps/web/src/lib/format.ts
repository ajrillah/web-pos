import { formatInteger, startOfLocalDay } from '@toko-podomoro/shared';

/** `22 Okt 2026` for a stored UTC timestamp, in local time. */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/** `22 Okt 2026` for a local day `YYYY-MM-DD`. */
export const dayLabel = (day: string) => shortDate(startOfLocalDay(day).toISOString());

/** Quantity in the stock unit: `1.250 gram`, `-3 pcs`. */
export const formatQty = (qty: number, baseUnit: string) => `${formatInteger(qty)} ${baseUnit}`;

/** Signed quantity change: `+12 pcs`, `-3 pcs`. */
export const formatQtyChange = (qty: number, baseUnit: string) =>
  `${qty > 0 ? '+' : ''}${formatQty(qty, baseUnit)}`;
