import { formatRupiah, type SummaryReport } from '@toko-podomoro/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dayLabel } from '../../lib/format';

/** Short rupiah: `Rp 1,5jt`, `Rp 150rb`, `Rp 850`. Integer math only; one decimal max. */
function shortRupiah(value: number): string {
  if (value >= 1_000_000) {
    const juta = Math.round(value / 100_000) / 10;
    return `Rp ${juta.toLocaleString('id-ID')}jt`;
  }
  if (value >= 1_000) {
    const ribu = Math.round(value / 100) / 10;
    return `Rp ${ribu.toLocaleString('id-ID')}rb`;
  }
  return `Rp ${value}`;
}

/** `3 Nov` for a local day `YYYY-MM-DD` (short, used only in a tight axis). */
function tickDate(day: string): string {
  const [y, m, d] = day.split('-').map((n) => Number(n));
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function renderTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown; payload?: unknown }>;
}) {
  const point = active && payload && payload.length > 0 ? payload[0] : null;
  if (!point) return null;
  const day = (point.payload as { day: string } | undefined)?.day ?? '';
  const value = typeof point.value === 'number' ? point.value : Number(point.value) || 0;
  return (
    <div className="rounded-row border border-border bg-popover px-3 py-2 shadow-card">
      <div className="label-caps">{day ? dayLabel(day) : ''}</div>
      <div className="tabular-nums font-semibold text-foreground">{formatRupiah(value)}</div>
    </div>
  );
}

/**
 * Daily revenue area chart for the sales report. Teal-filled bezier with a soft gradient; grid
 * lines in `--border`; axis labels in `--muted-foreground`. One row per `report.days` entry.
 */
export function RevenueChart({ report }: { report: SummaryReport }) {
  if (report.days.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-10 text-center text-muted-foreground">
        Tidak ada penjualan pada periode ini.
      </div>
    );
  }
  const peak = report.days.reduce((m, d) => Math.max(m, d.revenue), 0);
  // Pad the top so the curve breathes under the chart's edge.
  const yMax = peak > 0 ? Math.ceil((peak * 1.1) / 1000) * 1000 : 1000;
  return (
    <section
      aria-label="Grafik omzet harian"
      className="rounded-card border border-border bg-card p-5"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold">Omzet harian</h3>
        <p className="text-sm text-muted-foreground">
          {report.days.length} hari · puncak {formatRupiah(peak)}
        </p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={report.days} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                <stop offset="60%" stopColor="var(--primary)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={tickDate}
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              dataKey="revenue"
              domain={[0, yMax]}
              tickFormatter={shortRupiah}
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            <Tooltip
              cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={renderTooltip}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#revenue-fill)"
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
