import { formatInteger } from '@toko-podomoro/shared';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

const MAX_DIGITS = 10;

/**
 * Non-negative integer input shown with dot thousands separators (`12.500`).
 * `null` means empty. Optional prefix (e.g. `Rp`) and suffix (e.g. a unit) sit inside the field.
 */
export function NumberInput({
  value,
  onValueChange,
  prefix,
  suffix,
  className,
  signed = false,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'prefix'> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  prefix?: string;
  suffix?: string;
  signed?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      {prefix && (
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        type="text"
        inputMode={signed ? 'text' : 'numeric'}
        autoComplete="off"
        value={value === null ? '' : formatInteger(value)}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '' || raw === '-') {
            onValueChange(raw === '-' ? null : null);
            return;
          }
          const negative = signed && raw.startsWith('-');
          const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
          if (digits === '') {
            onValueChange(null);
            return;
          }
          const num = Number(digits);
          onValueChange(negative ? -num : num);
        }}
        className={cn('text-right tabular-nums', prefix && 'pl-11')}
        // Room for the suffix, however long the unit name is.
        style={suffix ? { paddingRight: `calc(1.5rem + ${suffix.length}ch)` } : undefined}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
