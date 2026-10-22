import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** Keyboard key hint, e.g. `F8`. Inherits color so it works on teal and neutral surfaces. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-current/10 px-1.5 font-mono text-[11px] font-semibold',
        className,
      )}
      {...props}
    />
  );
}
