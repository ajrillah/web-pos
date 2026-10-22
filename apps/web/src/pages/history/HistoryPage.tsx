import {
  formatRupiah,
  localDate,
  type SaleSummary,
  type SalesResponse,
} from '@toko-podomoro/shared';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { PageHeader } from '../../layout/PageHeader';
import { cn } from '../../lib/utils';
import { SaleDetailDialog } from './SaleDetailDialog';

const PAGE_SIZE = 50;

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

const dayLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';

/** Riwayat Transaksi: today by default; filter by date range, text, and status. */
export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const todayKey = localDate(new Date());
  const from = params.get('dari') ?? todayKey;
  const to = params.get('sampai') ?? from;
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const page = Math.max(1, Number(params.get('hal')) || 1);
  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<SalesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 250);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    let current = true;
    api
      .listSales({
        from,
        to,
        q: q || undefined,
        status: status as 'all' | 'completed' | 'voided',
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => {
        if (current) {
          setResult(r);
          setError(null);
        }
      })
      .catch((err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [from, to, q, status, page]);

  const total = result?.total ?? 0;
  const multiDay = from !== to;
  const sumTotal = (result?.sales ?? [])
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <section>
      <PageHeader title="Riwayat Transaksi" description="Transaksi selesai dan dibatalkan." />
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">Dari</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={todayKey}
              onChange={(e) =>
                update({ dari: e.target.value, sampai: e.target.value > to ? e.target.value : to })
              }
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Sampai</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              max={todayKey}
              onChange={(e) => update({ sampai: e.target.value })}
              className="w-44"
            />
          </div>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              data-search-input
              aria-label="Cari transaksi"
              placeholder="No. TRX, kode, atau nama barang"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12"
            />
          </div>
          <Select value={status} onValueChange={(v) => update({ status: v === 'all' ? null : v })}>
            <SelectTrigger aria-label="Status" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="completed">Selesai</SelectItem>
              <SelectItem value="voided">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ErrorAlert message={error} />

        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. TRX</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Kasir</TableHead>
                <TableHead className="text-right">Barang</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.sales.map((sale: SaleSummary) => (
                <TableRow
                  key={sale.id}
                  data-number={sale.number}
                  className={cn(
                    'cursor-pointer',
                    sale.status === 'voided' && 'text-muted-foreground',
                  )}
                  onClick={() => setOpenId(sale.id)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm font-mono text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(sale.id);
                      }}
                    >
                      {sale.number}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {multiDay && `${dayLabel(sale.completedAt)} `}
                    {time(sale.completedAt)}
                  </TableCell>
                  <TableCell>{sale.cashierName}</TableCell>
                  <TableCell className="text-right tabular-nums">{sale.itemCount}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatRupiah(sale.total)}
                  </TableCell>
                  <TableCell>
                    {sale.status === 'voided' ? (
                      <Badge variant="destructive">Dibatalkan</Badge>
                    ) : (
                      <Badge variant="neutral">Selesai</Badge>
                    )}
                    {sale.debtAmount > 0 && (
                      <Badge variant="warning" className="ml-1.5">
                        Kasbon
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result && total === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">
              Tidak ada transaksi pada periode ini.
            </p>
          )}
          {!result && !error && <p className="px-4 py-3 text-muted-foreground">Memuat…</p>}
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground tabular-nums" data-testid="sale-count">
            {total} transaksi
            {result && total <= PAGE_SIZE && ` · total selesai ${formatRupiah(sumTotal)}`}
          </p>
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
              disabled={page * PAGE_SIZE >= total}
              onClick={() => update({ hal: String(page + 1) })}
            >
              Berikutnya
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      <SaleDetailDialog saleId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}
