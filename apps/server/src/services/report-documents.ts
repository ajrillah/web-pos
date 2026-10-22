import {
  type ActivityReport,
  ADJUSTMENT_REASON_LABELS,
  type CashReport,
  type CategoriesReport,
  type DebtsReport,
  type LossesReport,
  type ProductSalesRow,
  type ProductsReport,
  REPORT_LABELS,
  type ReportType,
  type StockValueReport,
  type SummaryReport,
} from '@toko-podomoro/shared';

// A report as printable tables, shared by the PDF and Excel exports.

export type ColumnKind = 'text' | 'money' | 'int' | 'percent' | 'datetime';

export interface Column {
  label: string;
  kind: ColumnKind;
  /** Relative width in the PDF. */
  width: number;
}

/** Money and integers as numbers, percentages in basis points, datetimes as ISO text. */
export type Cell = string | number | null;

export interface Section {
  title: string;
  columns: Column[];
  rows: Cell[][];
  /** Totals row. */
  footer?: Cell[];
}

export interface ReportDocument {
  title: string;
  /** Period, filter, store, and when it was made. */
  meta: string[];
  summary: { label: string; value: Cell; kind: ColumnKind }[];
  sections: Section[];
  /** Wide tables print in landscape. */
  landscape: boolean;
}

const text = (label: string, width = 3): Column => ({ label, kind: 'text', width });
const money = (label: string, width = 2): Column => ({ label, kind: 'money', width });
const int = (label: string, width = 1.2): Column => ({ label, kind: 'int', width });
const percent = (label: string, width = 1.2): Column => ({ label, kind: 'percent', width });
const datetime = (label: string, width = 2): Column => ({ label, kind: 'datetime', width });

export interface DocumentContext {
  storeName: string;
  /** Local "dd/mm/yyyy hh:mm" of when the export was made. */
  printedAt: string;
  categoryName: string | null;
}

const dayLabel = (day: string) => day.split('-').reverse().join('/');
const periodLabel = (from: string, to: string) =>
  from === to ? `Tanggal ${dayLabel(from)}` : `Periode ${dayLabel(from)} s.d. ${dayLabel(to)}`;

function productSection(title: string, rows: ProductSalesRow[]): Section {
  return {
    title,
    columns: [
      text('Kode', 1.4),
      text('Barang', 3),
      text('Kategori', 1.6),
      int('Terjual'),
      text('Satuan', 1),
      money('Omzet'),
      money('Laba'),
      int('Stok'),
    ],
    rows: rows.map((r) => [
      r.productCode,
      r.productName,
      r.categoryName,
      r.qtyBase,
      r.baseUnit,
      r.revenue,
      r.profit,
      r.stock,
    ]),
  };
}

type Builder<T> = (report: T) => Omit<ReportDocument, 'title' | 'meta'> & { period?: string };

const builders: { [K in ReportType]: Builder<never> } = {
  summary: ((r: SummaryReport) => ({
    period: periodLabel(r.from, r.to),
    landscape: false,
    summary: [
      { label: 'Jumlah transaksi', value: r.totals.transactions, kind: 'int' },
      { label: 'Subtotal barang', value: r.totals.itemsSubtotal, kind: 'money' },
      { label: 'Pembulatan', value: r.totals.roundingAmount, kind: 'money' },
      { label: 'Omzet', value: r.totals.revenue, kind: 'money' },
      { label: 'Modal', value: r.totals.cost, kind: 'money' },
      { label: 'Laba kotor', value: r.totals.profit, kind: 'money' },
      { label: 'Margin', value: r.totals.marginBp, kind: 'percent' },
      { label: 'Kasbon dari penjualan', value: r.totals.kasbon, kind: 'money' },
      { label: 'Transaksi dibatalkan (tidak dihitung)', value: r.voided.count, kind: 'int' },
    ],
    sections: [
      {
        title: 'Per hari',
        columns: [
          text('Tanggal', 2),
          int('Transaksi'),
          money('Omzet'),
          money('Modal'),
          money('Laba'),
        ],
        rows: r.days.map((d) => [dayLabel(d.day), d.transactions, d.revenue, d.cost, d.profit]),
        footer: ['Total', r.totals.transactions, r.totals.revenue, r.totals.cost, r.totals.profit],
      },
    ],
  })) as Builder<never>,
  categories: ((r: CategoriesReport) => ({
    period: periodLabel(r.from, r.to),
    landscape: false,
    summary: [
      { label: 'Omzet barang', value: r.totals.revenue, kind: 'money' },
      { label: 'Laba kotor', value: r.totals.profit, kind: 'money' },
      { label: 'Margin', value: r.totals.marginBp, kind: 'percent' },
    ],
    sections: [
      {
        title: 'Per kategori',
        columns: [
          text('Kategori', 3),
          money('Omzet'),
          money('Modal'),
          money('Laba'),
          percent('Margin'),
          percent('Porsi'),
        ],
        rows: r.rows.map((c) => [
          c.categoryName,
          c.revenue,
          c.cost,
          c.profit,
          c.marginBp,
          c.shareBp,
        ]),
        footer: [
          'Total',
          r.totals.revenue,
          r.totals.cost,
          r.totals.profit,
          r.totals.marginBp,
          null,
        ],
      },
    ],
  })) as Builder<never>,
  products: ((r: ProductsReport) => ({
    period: periodLabel(r.from, r.to),
    landscape: true,
    summary: [{ label: 'Barang terjual', value: r.soldProducts, kind: 'int' }],
    sections: [productSection('Terlaris', r.top), productSection('Paling lambat', r.slow)],
  })) as Builder<never>,
  'stock-value': ((r: StockValueReport) => {
    const columns = [
      text('Kode', 1.4),
      text('Barang', 3),
      text('Kategori', 1.6),
      int('Stok'),
      text('Satuan', 1),
      money('Harga modal'),
      money('Nilai'),
    ];
    const row = (s: StockValueReport['rows'][number]): Cell[] => [
      s.productCode,
      s.active ? s.productName : `${s.productName} (nonaktif)`,
      s.categoryName,
      s.stock,
      s.baseUnit,
      s.costPrice,
      s.value,
    ];
    return {
      landscape: true,
      summary: [
        { label: 'Nilai stok', value: r.totals.value, kind: 'money' },
        { label: 'Jumlah barang', value: r.totals.items, kind: 'int' },
        { label: 'Barang stok minus', value: r.negatives.length, kind: 'int' },
      ],
      sections: [
        {
          title: 'Stok bernilai',
          columns,
          rows: r.rows.map(row),
          footer: ['Total', null, null, null, null, null, r.totals.value],
        },
        { title: 'Stok minus (dihitung 0)', columns, rows: r.negatives.map(row) },
      ],
    };
  }) as Builder<never>,
  cash: ((r: CashReport) => {
    const t = r.totals;
    const cols = (kind: 'Cash' | 'Qris'): Section => ({
      title: kind === 'Cash' ? 'Arus kas tunai per hari' : 'QRIS per hari',
      columns: [
        text('Tanggal', 1.6),
        money('Penjualan'),
        money('Bayar kasbon'),
        money('Bayar pemasok'),
        money('Pembatalan'),
        money('Bersih'),
      ],
      rows: r.days.map((d) => [
        dayLabel(d.day),
        d[`sales${kind}`],
        d[`kasbon${kind}`],
        // Money out.
        -d[`supplier${kind}`],
        d[`void${kind}`],
        d[`net${kind}`],
      ]),
      footer: [
        'Total',
        t[`sales${kind}`],
        t[`kasbon${kind}`],
        -t[`supplier${kind}`],
        t[`void${kind}`],
        t[`net${kind}`],
      ],
    });
    return {
      period: periodLabel(r.from, r.to),
      landscape: false,
      summary: [
        { label: 'Penjualan tunai (dikurangi kembalian)', value: t.salesCash, kind: 'money' },
        { label: 'Penjualan QRIS', value: t.salesQris, kind: 'money' },
        { label: 'Kas tunai bersih', value: t.netCash, kind: 'money' },
        { label: 'QRIS bersih', value: t.netQris, kind: 'money' },
      ],
      sections: [cols('Cash'), cols('Qris')],
    };
  }) as Builder<never>,
  debts: ((r: DebtsReport) => {
    const columns = (who: string) => [
      text(who, 3),
      int('Jumlah nota'),
      datetime('Tertua'),
      money('Sisa'),
    ];
    return {
      landscape: false,
      summary: [
        { label: 'Total piutang (kasbon pelanggan)', value: r.receivables.total, kind: 'money' },
        { label: 'Total hutang ke pemasok', value: r.payables.total, kind: 'money' },
      ],
      sections: [
        {
          title: 'Piutang pelanggan',
          columns: columns('Pelanggan'),
          rows: r.receivables.customers.map((c) => [c.name, c.openCount, c.oldestAt, c.balance]),
          footer: ['Total', null, null, r.receivables.total],
        },
        {
          title: 'Hutang ke pemasok',
          columns: columns('Pemasok'),
          rows: r.payables.suppliers.map((s) => [s.name, s.openCount, s.oldestAt, s.balance]),
          footer: ['Total', null, null, r.payables.total],
        },
      ],
    };
  }) as Builder<never>,
  losses: ((r: LossesReport) => ({
    period: periodLabel(r.from, r.to),
    landscape: true,
    summary: [
      { label: 'Nilai kerugian', value: r.totals.value, kind: 'money' },
      ...r.byReason.map((b) => ({
        label: `${ADJUSTMENT_REASON_LABELS[b.reason]} (${b.count}x)`,
        value: b.value,
        kind: 'money' as const,
      })),
    ],
    sections: [
      {
        title: 'Rincian',
        columns: [
          datetime('Waktu'),
          text('Kode', 1.2),
          text('Barang', 2.6),
          int('Jumlah'),
          text('Satuan', 1),
          text('Alasan', 2.4),
          money('Nilai'),
          text('Oleh', 1.4),
        ],
        rows: r.rows.map((l) => [
          l.createdAt,
          l.productCode,
          l.productName,
          l.qtyBase,
          l.baseUnit,
          l.note
            ? `${ADJUSTMENT_REASON_LABELS[l.reason]}: ${l.note}`
            : ADJUSTMENT_REASON_LABELS[l.reason],
          l.value,
          l.userName,
        ]),
        footer: ['Total', null, null, null, null, null, r.totals.value, null],
      },
    ],
  })) as Builder<never>,
  activity: ((r: ActivityReport) => ({
    period: periodLabel(r.from, r.to),
    landscape: true,
    summary: [{ label: 'Jumlah aktivitas', value: r.total, kind: 'int' }],
    sections: [
      {
        title: 'Aktivitas',
        columns: [
          datetime('Waktu'),
          text('Pengguna', 1.6),
          text('Disetujui', 1.6),
          text('Keterangan', 7),
        ],
        rows: r.rows.map((a) => [
          a.createdAt,
          a.userName ?? 'Sistem',
          a.approvedByName,
          a.description,
        ]),
      },
    ],
  })) as Builder<never>,
};

export function reportDocument(
  type: ReportType,
  report: unknown,
  context: DocumentContext,
): ReportDocument {
  const { period, ...body } = (builders[type] as Builder<unknown>)(report);
  return {
    title: `Laporan ${REPORT_LABELS[type]}`,
    meta: [
      context.storeName,
      ...(period ? [period] : ['Posisi saat dicetak']),
      ...(context.categoryName ? [`Kategori: ${context.categoryName}`] : []),
      `Dicetak ${context.printedAt}`,
    ],
    ...body,
  };
}
