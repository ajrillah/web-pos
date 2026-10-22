import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

// Variants follow the exclusive color meanings in docs/ui-style.md section 1.
export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        /** Teal: key labels such as "BARU" or the current user's role. */
        primary: 'bg-primary-soft text-primary',
        neutral: 'bg-muted text-muted-foreground',
        /** Gold: held, kasbon, warning, temporary PIN, PIN-gated. */
        warning: 'border border-warning-border bg-warning-soft text-warning-foreground',
        /** Green: paid, change. */
        success: 'bg-success-soft text-success',
        /** Red: void, cancel, negative. */
        destructive: 'bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
