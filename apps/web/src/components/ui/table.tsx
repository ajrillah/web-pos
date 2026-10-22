import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

// No grid lines: the header is small caps text and rows are rounded hover/selected blocks.

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full border-separate border-spacing-y-1 text-left text-[17px]', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" {...props} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        '[&>td:first-child]:rounded-l-row [&>td:last-child]:rounded-r-row',
        '[tbody>&:hover>td]:bg-muted',
        '[tbody>&[data-state=selected]>td]:bg-selected [tbody>&[data-state=selected]:hover>td]:bg-selected',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('label-caps px-4 pb-1 align-bottom whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td data-slot="table-cell" className={cn('px-4 py-3 align-middle', className)} {...props} />
  );
}
