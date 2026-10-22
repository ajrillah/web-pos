import { formatRupiah, localDate, type PurchasesResponse } from '@toko-podomoro/shared';
import { ChevronLeft, ChevronRight, PackagePlus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
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
import { dayLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { PurchaseDetailDialog } from './PurchaseDetailDialog';

const PAGE_SIZE = 50;

/** Stok > Stok Masuk: purchases newest first; filter by date, text, status. */
export function PurchasesPage() {
  const [params, setParams] = useSearchParams();
  const todayKey = localDate(new Date());
  const from = params.get('dari') ?? '';
  const to = params.get('sampai') ?? '';
  const status = params.get('status') ?? 'all';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('hal')) || 1);
  const openId = params.get('buka');
  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<PurchasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (current) => {
          const merged = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            if (value === null || value === '') merged.delete(key);
            else merged.set(key, value);
          }
          if (!('hal' in next) && !('buka' in next)) merged.delete('hal');
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 250);
    return () => clearTimeout(timer);
  });

  const load = useCallback(() => {
    api
      .listPurchases({
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
        status: status as 'all' | 'completed' | 'voided',
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [from, to, q, status, page]);

  useEffect(load, [load]);

  const total = result?.total ?? 0;

  return (
    <section>
      <PageHeader
        title="Stok Masuk"
        description="Pembelian dari pemasok. Stok masuk tidak dapat diubah, hanya dibatalkan."
        actions={
          <Button asChild>
            <Link to="/stok/masuk/baru">
              <PackagePlus className="size-[18px]" aria-hidden />
              Stok masuk baru
            </Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">Dari</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={todayKey}
              onChange={(e) => update({ dari: e.target.value })}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Sampai</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from || undefined}
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
              aria-label="Cari stok masuk"
              placeholder="No. stok masuk atau pemasok"
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
                <TableHead>No.</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Pemasok</TableHead>
                <TableHead className="text-right">Barang</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Sisa hutang</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.purchases.map((p) => (
                <TableRow
                  key={p.id}
                  data-number={p.number}
                  className={cn('cursor-pointer', p.status === 'voided' && 'text-muted-foreground')}
                  onClick={() => update({ buka: p.id })}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="rounded-sm font-mono text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        update({ buka: p.id });
                      }}
                    >
                      {p.number}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">{dayLabel(p.date)}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatRupiah(p.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.status === 'completed' && p.remaining > 0 ? (
                      <span className="font-semibold text-warning-foreground">
                        {formatRupiah(p.remaining)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.status === 'voided' ? (
                      <Badge variant="destructive">Dibatalkan</Badge>
                    ) : p.remaining > 0 ? (
                      <Badge variant="warning">Hutang</Badge>
                    ) : (
                      <Badge variant="success">Lunas</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result && total === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada stok masuk.</p>
          )}
          {!result && !error && <p className="px-4 py-3 text-muted-foreground">Memuat…</p>}
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground tabular-nums">{total} stok masuk</p>
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
      <PurchaseDetailDialog
        purchaseId={openId}
        onClose={() => update({ buka: null })}
        onChanged={load}
      />
    </section>
  );
}
