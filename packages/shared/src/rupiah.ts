/** Formats an integer with dot thousands separators: `12.345`, `-1.000`. */
export function formatInteger(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`value must be a safe integer, got ${value}`);
  }
  const digits = Math.abs(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 ? `-${digits}` : digits;
}

/** Formats integer Rupiah as `Rp 12.345` (dot thousands separator, no decimals). */
export function formatRupiah(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`amount must be a safe integer, got ${amount}`);
  }
  const digits = formatInteger(Math.abs(amount));
  return amount < 0 ? `-Rp ${digits}` : `Rp ${digits}`;
}

/** Basis points as an Indonesian percentage: 1850 -> `18,5%`, -300 -> `-3%`. */
export function formatPercentBp(bp: number): string {
  if (!Number.isSafeInteger(bp)) {
    throw new RangeError(`bp must be a safe integer, got ${bp}`);
  }
  const abs = Math.abs(bp);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${bp < 0 ? '-' : ''}${formatInteger(whole)}${frac ? `,${frac}` : ''}%`;
}
