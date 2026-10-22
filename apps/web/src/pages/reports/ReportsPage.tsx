import {
  CATEGORY_REPORTS,
  type Category,
  DATED_REPORTS,
  type ExportFormat,
  localDate,
  REPORT_LABELS,
  type ReportResponse,
  type ReportType,
  reportTypeSchema,
  startOfLocalDay,
} from '@toko-podomoro/shared';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api, reports } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { PageHeader } from '../../layout/PageHeader';
import {
  ActivityView,
  CashView,
  CategoriesView,
  DebtsView,
  LossesView,
  ProductsView,
  StockValueView,
  SummaryView,
} from './views';

const TAB_LABELS: Record<ReportType, string> = {
  summary: 'Penjualan',
  categories: 'Kategori',
  products: 'Barang',
  'stock-value': 'Nilai Stok',
  cash: 'Kas',
  debts: 'Piutang & Hutang',
  losses: 'Kerugian',
  activity: 'Aktivitas',
};

const TYPES = reportTypeSchema.options;
const ACTIVITY_PAGE = 100;

/** Days back from today (local). */
function daysAgo(today: string, n: number): string {
  const d = startOfLocalDay(today);
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
}

function renderReport(type: ReportType, data: unknown): ReactNode {
  switch (type) {
    case 'summary':
      return <SummaryView report={data as ReportResponse<'summary'>} />;
    case 'categories':
      return <CategoriesView report={data as ReportResponse<'categories'>} />;
    case 'products':
      return <ProductsView report={data as ReportResponse<'products'>} />;
    case 'stock-value':
      return <StockValueView report={data as ReportResponse<'stock-value'>} />;
    case 'cash':
      return <CashView report={data as ReportResponse<'cash'>} />;
    case 'debts':
      return <DebtsView report={data as ReportResponse<'debts'>} />;
    case 'losses':
      return <LossesView report={data as ReportResponse<'losses'>} />;
    case 'activity':
      return <ActivityView report={data as ReportResponse<'activity'>} />;
  }
}

/**
 * Laporan (owner PIN for cashiers): eight tabs, one per report; each can be saved as PDF or
 * Excel with the same filters.
 */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const today = localDate(new Date());
  const parsedTab = reportTypeSchema.safeParse(params.get('tab'));
  const type: ReportType = parsedTab.success ? parsedTab.data : 'summary';
  const from = params.get('dari') ?? today;
  const to = params.get('sampai') ?? from;
  const categoryId = params.get('kategori') ?? '';
  const page = Math.max(1, Number(params.get('hal')) || 1);
  const dated = DATED_REPORTS.includes(type);
  const byCategory = CATEGORY_REPORTS.includes(type);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState<{ type: ReportType; data: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ExportFormat | null>(null);

  function update(next: Record<string, string | null>) {
    setParams(
      (current) => {
        const merged = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === '') merged.delete(key);
          else merged.set(key, value);
        }
        if (!('hal' in next)) merged.delete('hal');
        return merged;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    api
      .listCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, []);

  const query: Record<string, string | number> = {
    ...(dated ? { from, to } : {}),
    ...(byCategory && categoryId ? { categoryId } : {}),
    ...(type === 'activity' ? { page, limit: ACTIVITY_PAGE } : {}),
  };
  const queryKey = JSON.stringify([type, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: queryKey covers type and query.
  useEffect(() => {
    let current = true;
    setError(null);
    reports
      .get(type, query as never)
      .then((data) => current && setLoaded({ type, data }))
      .catch((err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [queryKey]);

  async function save(format: ExportFormat) {
    setSaving(format);
    try {
      const { page: _page, limit: _limit, ...filters } = query;
      const fileName = await reports.download(type, format, filters as never);
      toast.success(`Laporan disimpan: ${fileName}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  const presets = [
    { label: 'Hari ini', from: today, to: today },
    { label: '7 hari', from: daysAgo(today, 6), to: today },
    { label: 'Bulan ini', from: `${today.slice(0, 8)}01`, to: today },
  ];
  const activity = loaded?.type === 'activity' ? (loaded.data as ReportResponse<'activity'>) : null;

  return (
    <section>
      <PageHeader
        title="Laporan"
        description={REPORT_LABELS[type]}
        actions={
          <>
            <Button variant="outline" disabled={saving !== null} onClick={() => void save('pdf')}>
              <FileText className="size-[18px]" aria-hidden />
              {saving === 'pdf' ? 'Menyimpan…' : 'Simpan PDF'}
            </Button>
            <Button variant="outline" disabled={saving !== null} onClick={() => void save('xlsx')}>
              <FileSpreadsheet className="size-[18px]" aria-hidden />
              {saving === 'xlsx' ? 'Menyimpan…' : 'Simpan Excel'}
            </Button>
          </>
        }
      />
      <div className="space-y-5">
        <Tabs value={type} onValueChange={(v) => update({ tab: v === 'summary' ? null : v })}>
          <TabsList aria-label="Jenis laporan">
            {TYPES.map((t) => (
              <TabsTrigger key={t} value={t} data-report-tab={t}>
                {TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {(dated || byCategory) && (
          <div className="flex flex-wrap items-end gap-3">
            {dated && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="report-from">Dari</Label>
                  <Input
                    id="report-from"
                    type="date"
                    value={from}
                    max={today}
                    onChange={(e) =>
                      update({
                        dari: e.target.value || today,
                        sampai: e.target.value > to ? e.target.value : to,
                      })
                    }
                    className="w-44"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-to">Sampai</Label>
                  <Input
                    id="report-to"
                    type="date"
                    value={to}
                    min={from}
                    max={today}
                    onChange={(e) => update({ sampai: e.target.value || from })}
                    className="w-44"
                  />
                </div>
                <div className="flex gap-1.5">
                  {presets.map((p) => (
                    <Button
                      key={p.label}
                      variant={from === p.from && to === p.to ? 'secondary' : 'ghost'}
                      onClick={() => update({ dari: p.from, sampai: p.to })}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
            {byCategory && (
              <div className="ml-auto space-y-1.5">
                <Label htmlFor="report-category">Kategori</Label>
                <Select
                  value={categoryId || 'all'}
                  onValueChange={(v) => update({ kategori: v === 'all' ? null : v })}
                >
                  <SelectTrigger id="report-category" className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua kategori</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        {!dated && (
          <p className="text-muted-foreground">
            Posisi saat ini,{' '}
            {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}.
          </p>
        )}

        <ErrorAlert message={error} />
        {loaded?.type === type
          ? renderReport(type, loaded.data)
          : !error && <p className="text-muted-foreground">Memuat…</p>}

        {activity && type === 'activity' && activity.total > ACTIVITY_PAGE && (
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground tabular-nums">{activity.total} aktivitas</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => update({ hal: String(page - 1) })}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * ACTIVITY_PAGE >= activity.total}
                onClick={() => update({ hal: String(page + 1) })}
              >
                Berikutnya
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
