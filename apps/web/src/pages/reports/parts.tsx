import { formatPercentBp, formatRupiah } from '@toko-podomoro/shared';
import type { ReactNode } from 'react';
import { Card } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { cn } from '../../lib/utils';

/** Money; negative amounts in red. */
export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', value < 0 && 'text-destructive', className)}>
      {formatRupiah(value)}
    </span>
  );
}

export const percent = (bp: number | null) => (bp === null ? '—' : formatPercentBp(bp));

export function StatCard({
  label,
  children,
  hint,
  testId,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <Card className="space-y-1 p-5">
      <div className="label-caps">{label}</div>
      <div className="text-[28px] leading-tight font-bold tabular-nums" data-testid={testId}>
        {children}
      </div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
  /** Numbers are right-aligned. */
  numeric?: boolean;
  className?: string;
}

/** Report table: no grid lines, rounded rows; optional bold totals row. */
export function ReportTable<T>({
  title,
  columns,
  rows,
  rowKey,
  footer,
  empty = 'Tidak ada data pada periode ini.',
  testId,
}: {
  title?: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  footer?: ReactNode[];
  empty?: string;
  testId?: string;
}) {
  return (
    <Card className="px-3 py-4" data-testid={testId}>
      {title && <h2 className="px-3 pb-2 text-lg font-semibold">{title}</h2>}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.label} className={cn(c.numeric && 'text-right')}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell
                  key={c.label}
                  className={cn(
                    c.numeric && 'text-right whitespace-nowrap tabular-nums',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {footer && rows.length > 0 && (
            <TableRow className="font-bold hover:bg-transparent">
              {footer.map((cell, i) => (
                <TableCell
                  // biome-ignore lint/suspicious/noArrayIndexKey: footer cells line up with columns by position.
                  key={i}
                  className={cn(
                    'border-t border-border',
                    columns[i]?.numeric && 'text-right whitespace-nowrap tabular-nums',
                  )}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rows.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">{empty}</p>}
    </Card>
  );
}
