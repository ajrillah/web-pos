import {
  type ActivityReport,
  ADJUSTMENT_REASON_LABELS,
  type CashDay,
  type CashReport,
  type CategoriesReport,
  type DebtParty,
  type DebtsReport,
  formatInteger,
  type LossesReport,
  type ProductSalesRow,
  type ProductsReport,
  type StockValueReport,
  type StockValueRow,
  type SummaryReport,
} from '@toko-podomoro/shared';
import { dayLabel, formatQty, shortDate } from '../../lib/format';
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';
import { type Column, Money, percent, ReportTable, StatCard } from './parts';
import { RevenueChart } from './RevenueChart';

export function SummaryView({ report }: { report: SummaryReport }) {
  const t = report.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Omzet"
          testId="summary-revenue"
          hint={`${formatInteger(t.transactions)} transaksi`}
        >
          <Money value={t.revenue} />
        </StatCard>
        <StatCard label="Modal">
          <Money value={t.cost} />
        </StatCard>
        <StatCard label="Laba kotor" hint={`Margin ${percent(t.marginBp)}`}>
          <Money value={t.profit} />
        </StatCard>
        <StatCard
          label="Kasbon dari penjualan"
          hint={
            report.voided.count > 0
              ? `${report.voided.count} transaksi dibatalkan tidak dihitung`
              : 'Tidak ada transaksi dibatalkan'
          }
        >
          <Money value={t.kasbon} className="text-warning-foreground" />
        </StatCard>
      </div>
      <RevenueChart report={report} />
      <ReportTable
        title="Per hari"
        rowKey={(d) => d.day}
        rows={report.days}
        columns={[
          { label: 'Tanggal', cell: (d) => dayLabel(d.day) },
          { label: 'Transaksi', numeric: true, cell: (d) => formatInteger(d.transactions) },
          { label: 'Omzet', numeric: true, cell: (d) => <Money value={d.revenue} /> },
          { label: 'Modal', numeric: true, cell: (d) => <Money value={d.cost} /> },
          { label: 'Laba', numeric: true, cell: (d) => <Money value={d.profit} /> },
        ]}
        footer={[
          'Total',
          formatInteger(t.transactions),
          <Money key="r" value={t.revenue} />,
          <Money key="c" value={t.cost} />,
          <Money key="p" value={t.profit} />,
        ]}
      />
      {t.roundingAmount !== 0 && (
        <p className="text-sm text-muted-foreground">
          Omzet sudah termasuk pembulatan <Money value={t.roundingAmount} /> (subtotal barang{' '}
          <Money value={t.itemsSubtotal} />
          ).
        </p>
      )}
    </div>
  );
}

export function CategoriesView({ report }: { report: CategoriesReport }) {
  const t = report.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Omzet barang" testId="categories-revenue">
          <Money value={t.revenue} />
        </StatCard>
        <StatCard label="Laba kotor">
          <Money value={t.profit} />
        </StatCard>
        <StatCard label="Margin">{percent(t.marginBp)}</StatCard>
      </div>
      <ReportTable
        rowKey={(c) => c.categoryId}
        rows={report.rows}
        columns={[
          {
            label: 'Kategori',
            cell: (c) => <span className="font-semibold">{c.categoryName}</span>,
          },
          { label: 'Omzet', numeric: true, cell: (c) => <Money value={c.revenue} /> },
          { label: 'Modal', numeric: true, cell: (c) => <Money value={c.cost} /> },
          { label: 'Laba', numeric: true, cell: (c) => <Money value={c.profit} /> },
          { label: 'Margin', numeric: true, cell: (c) => percent(c.marginBp) },
          { label: 'Porsi', numeric: true, cell: (c) => percent(c.shareBp) },
        ]}
        footer={[
          'Total',
          <Money key="r" value={t.revenue} />,
          <Money key="c" value={t.cost} />,
          <Money key="p" value={t.profit} />,
          percent(t.marginBp),
          '',
        ]}
      />
    </div>
  );
}

const productColumns: Column<ProductSalesRow>[] = [
  {
    label: 'Barang',
    cell: (p) => (
      <>
        <div className="font-semibold">{p.productName}</div>
        <div className="text-sm text-muted-foreground">
          <span className="font-mono">{p.productCode}</span> · {p.categoryName}
        </div>
      </>
    ),
  },
  { label: 'Terjual', numeric: true, cell: (p) => formatQty(p.qtyBase, p.baseUnit) },
  { label: 'Omzet', numeric: true, cell: (p) => <Money value={p.revenue} /> },
  { label: 'Laba', numeric: true, cell: (p) => <Money value={p.profit} /> },
  {
    label: 'Stok',
    numeric: true,
    cell: (p) => (
      <span className={cn(p.stock < 0 && 'font-semibold text-destructive')}>
        {formatQty(p.stock, p.baseUnit, p.unitChain)}
      </span>
    ),
  },
];

export function ProductsView({ report }: { report: ProductsReport }) {
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground" data-testid="sold-products">
        {formatInteger(report.soldProducts)} barang terjual pada periode ini.
      </p>
      <ReportTable
        title="Terlaris"
        rowKey={(p) => `${p.productId}-${p.categoryName}`}
        rows={report.top}
        columns={productColumns}
      />
      <ReportTable
        title="Paling lambat (barang aktif)"
        rowKey={(p) => p.productId}
        rows={report.slow}
        columns={productColumns}
        empty="Tidak ada barang aktif."
      />
    </div>
  );
}

const stockColumns: Column<StockValueRow>[] = [
  {
    label: 'Barang',
    cell: (s) => (
      <>
        <div className="font-semibold">
          {s.productName}
          {!s.active && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">nonaktif</span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-mono">{s.productCode}</span> · {s.categoryName}
        </div>
      </>
    ),
  },
  {
    label: 'Stok',
    numeric: true,
    cell: (s) => (
      <span className={cn(s.stock < 0 && 'font-semibold text-destructive')}>
        {formatQty(s.stock, s.baseUnit, s.unitChain)}
      </span>
    ),
  },
  { label: 'Harga modal', numeric: true, cell: (s) => <Money value={s.costPrice} /> },
  { label: 'Nilai', numeric: true, cell: (s) => <Money value={s.value} /> },
];

export function StockValueView({ report }: { report: StockValueReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Nilai stok" testId="stock-value" hint="Stok minus dihitung 0">
          <Money value={report.totals.value} />
        </StatCard>
        <StatCard label="Barang bernilai">{formatInteger(report.totals.items)}</StatCard>
        <StatCard label="Barang stok minus">
          <span className={cn(report.negatives.length > 0 && 'text-destructive')}>
            {formatInteger(report.negatives.length)}
          </span>
        </StatCard>
      </div>
      {report.negatives.length > 0 && (
        <ReportTable
          title="Stok minus"
          testId="negative-stock"
          rowKey={(s) => s.productId}
          rows={report.negatives}
          columns={stockColumns}
        />
      )}
      <ReportTable
        title="Stok bernilai"
        rowKey={(s) => s.productId}
        rows={report.rows}
        columns={stockColumns}
        empty="Tidak ada stok."
        footer={['Total', '', '', <Money key="v" value={report.totals.value} />]}
      />
    </div>
  );
}

function cashColumns(kind: 'Cash' | 'Qris'): Column<CashDay>[] {
  return [
    { label: 'Tanggal', cell: (d) => dayLabel(d.day) },
    { label: 'Penjualan', numeric: true, cell: (d) => <Money value={d[`sales${kind}`]} /> },
    { label: 'Bayar kasbon', numeric: true, cell: (d) => <Money value={d[`kasbon${kind}`]} /> },
    { label: 'Bayar pemasok', numeric: true, cell: (d) => <Money value={-d[`supplier${kind}`]} /> },
    { label: 'Pembatalan', numeric: true, cell: (d) => <Money value={d[`void${kind}`]} /> },
    {
      label: 'Bersih',
      numeric: true,
      cell: (d) => <Money value={d[`net${kind}`]} className="font-semibold" />,
    },
  ];
}

// Transfers only ever come from sales, so no kasbon or supplier columns.
const transferColumns: Column<CashDay>[] = [
  { label: 'Tanggal', cell: (d) => dayLabel(d.day) },
  { label: 'Penjualan', numeric: true, cell: (d) => <Money value={d.salesTransfer} /> },
  { label: 'Pembatalan', numeric: true, cell: (d) => <Money value={d.voidTransfer} /> },
  {
    label: 'Bersih',
    numeric: true,
    cell: (d) => <Money value={d.netTransfer} className="font-semibold" />,
  },
];

export function CashView({ report }: { report: CashReport }) {
  const t = report.totals;
  const footer = (kind: 'Cash' | 'Qris') => [
    'Total',
    <Money key="s" value={t[`sales${kind}`]} />,
    <Money key="k" value={t[`kasbon${kind}`]} />,
    <Money key="p" value={-t[`supplier${kind}`]} />,
    <Money key="v" value={t[`void${kind}`]} />,
    <Money key="n" value={t[`net${kind}`]} />,
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Kas tunai bersih" testId="net-cash">
          <Money value={t.netCash} />
        </StatCard>
        <StatCard label="QRIS bersih" testId="net-qris">
          <Money value={t.netQris} />
        </StatCard>
        <StatCard label="Transfer bersih" testId="net-transfer">
          <Money value={t.netTransfer} />
        </StatCard>
        <StatCard label="Penjualan tunai" hint="Sudah dikurangi kembalian">
          <Money value={t.salesCash} />
        </StatCard>
        <StatCard label="Penjualan QRIS">
          <Money value={t.salesQris} />
        </StatCard>
        <StatCard label="Penjualan transfer bank">
          <Money value={t.salesTransfer} />
        </StatCard>
      </div>
      <p className="text-sm text-muted-foreground">
        Uang dihitung pada tanggal bergerak: pembatalan mengembalikan uang pada tanggal batal.
      </p>
      <ReportTable
        title="Arus kas tunai per hari"
        rowKey={(d) => d.day}
        rows={report.days}
        columns={cashColumns('Cash')}
        footer={footer('Cash')}
      />
      <ReportTable
        title="QRIS per hari"
        rowKey={(d) => d.day}
        rows={report.days}
        columns={cashColumns('Qris')}
        footer={footer('Qris')}
      />
      <ReportTable
        title="Transfer bank per hari"
        rowKey={(d) => d.day}
        rows={report.days}
        columns={transferColumns}
        footer={[
          'Total',
          <Money key="s" value={t.salesTransfer} />,
          <Money key="v" value={t.voidTransfer} />,
          <Money key="n" value={t.netTransfer} />,
        ]}
      />
    </div>
  );
}

const partyColumns = (who: string): Column<DebtParty>[] => [
  { label: who, cell: (p) => <span className="font-semibold">{p.name}</span> },
  { label: 'Nota', numeric: true, cell: (p) => formatInteger(p.openCount) },
  { label: 'Tertua', numeric: true, cell: (p) => shortDate(p.oldestAt) },
  {
    label: 'Sisa',
    numeric: true,
    cell: (p) => <Money value={p.balance} className="font-semibold text-warning-foreground" />,
  },
];

export function DebtsView({ report }: { report: DebtsReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Piutang pelanggan" testId="receivables-total">
          <Money value={report.receivables.total} className="text-warning-foreground" />
        </StatCard>
        <StatCard label="Hutang ke pemasok" testId="payables-total">
          <Money value={report.payables.total} className="text-warning-foreground" />
        </StatCard>
      </div>
      <div className="grid grid-cols-2 items-start gap-4">
        <ReportTable
          title="Piutang"
          rowKey={(p) => p.id}
          rows={report.receivables.customers}
          columns={partyColumns('Pelanggan')}
          empty="Tidak ada piutang."
        />
        <ReportTable
          title="Hutang"
          rowKey={(p) => p.id}
          rows={report.payables.suppliers}
          columns={partyColumns('Pemasok')}
          empty="Tidak ada hutang."
        />
      </div>
    </div>
  );
}

export function LossesView({ report }: { report: LossesReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Nilai kerugian"
          testId="losses-total"
          hint={`${formatInteger(report.totals.count)} penyesuaian`}
        >
          <Money value={-report.totals.value} />
        </StatCard>
        {report.byReason.slice(0, 3).map((r) => (
          <StatCard
            key={r.reason}
            label={ADJUSTMENT_REASON_LABELS[r.reason]}
            hint={`${r.count} kali`}
          >
            <Money value={-r.value} />
          </StatCard>
        ))}
      </div>
      <ReportTable
        rowKey={(l) => l.adjustmentId}
        rows={report.rows}
        empty="Tidak ada kerugian stok pada periode ini."
        columns={[
          {
            label: 'Waktu',
            cell: (l) => (
              <span className="whitespace-nowrap tabular-nums">{dateTime(l.createdAt)}</span>
            ),
          },
          {
            label: 'Barang',
            cell: (l) => (
              <>
                <div className="font-semibold">{l.productName}</div>
                <div className="font-mono text-sm text-muted-foreground">{l.productCode}</div>
              </>
            ),
          },
          { label: 'Jumlah', numeric: true, cell: (l) => formatQty(l.qtyBase, l.baseUnit) },
          {
            label: 'Alasan',
            cell: (l) => (
              <>
                {ADJUSTMENT_REASON_LABELS[l.reason]}
                {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
              </>
            ),
          },
          { label: 'Nilai', numeric: true, cell: (l) => <Money value={-l.value} /> },
          { label: 'Oleh', cell: (l) => l.userName },
        ]}
        footer={['Total', '', '', '', <Money key="v" value={-report.totals.value} />, '']}
      />
    </div>
  );
}

export function ActivityView({ report }: { report: ActivityReport }) {
  return (
    <ReportTable
      rowKey={(a) => a.id}
      rows={report.rows}
      testId="activity"
      empty="Tidak ada aktivitas pada periode ini."
      columns={[
        {
          label: 'Waktu',
          cell: (a) => (
            <span className="whitespace-nowrap tabular-nums">{dateTime(a.createdAt)}</span>
          ),
        },
        {
          label: 'Pengguna',
          cell: (a) => (
            <>
              <div>{a.userName ?? 'Sistem'}</div>
              {a.approvedByName && (
                <div className="text-sm text-muted-foreground">disetujui {a.approvedByName}</div>
              )}
            </>
          ),
        },
        {
          label: 'Keterangan',
          cell: (a) => (
            <span
              className={cn(
                (a.action === 'void' || a.action === 'failed_pin') && 'text-destructive',
              )}
            >
              {a.description}
            </span>
          ),
        },
      ]}
    />
  );
}
