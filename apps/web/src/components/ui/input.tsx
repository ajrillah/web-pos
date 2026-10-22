import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-control border border-input bg-card px-4 text-base text-foreground outline-none transition-[border-color,box-shadow]',
        'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft',
        'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
