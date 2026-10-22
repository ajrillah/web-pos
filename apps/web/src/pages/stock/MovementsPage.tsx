import {
  ADJUSTMENT_REASON_LABELS,
  localDate,
  MOVEMENT_TYPE_LABELS,
  type MovementsResponse,
  type MovementType,
  type Product,
} from '@toko-podomoro/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { ProductPicker } from '../../components/ProductPicker';
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
import { formatQty, formatQtyChange } from '../../lib/format';
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';

const PAGE_SIZE = 50;
const TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

/** Stok > Riwayat: every stock movement, newest first, with the stock after it. */
export function MovementsPage() {
  const todayKey = localDate(new Date());
  const [product, setProduct] = useState<Product | null>(null);
  const [type, setType] = useState<MovementType | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MovementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listMovements({
        productId: product?.id,
        type: type === 'all' ? undefined : type,
        from: from || undefined,
        to: to || undefined,
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
  }, [product, type, from, to, page]);

  const total = result?.total ?? 0;

  return (
    <section>
      <PageHeader
        title="Riwayat stok"
        description="Setiap perubahan stok: penjualan, stok masuk, penyesuaian, dan pembatalan."
      />
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="movement-product">Barang</Label>
            {product ? (
              <div className="flex h-12 items-center justify-between rounded-control border border-input bg-card px-4">
                <span className="truncate">
                  <span className="font-semibold">{product.name}</span>
                  <span className="ml-2 font-mono text-sm text-muted-foreground">
                    {product.code}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Semua barang"
                  onClick={() => {
                    setProduct(null);
                    setPage(1);
                  }}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <ProductPicker
                id="movement-product"
                placeholder="Semua barang (cari kode atau nama)"
                onPick={(p) => {
                  setProduct(p);
                  setPage(1);
                }}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="movement-type">Jenis</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as MovementType | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger id="movement-type" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MOVEMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="movement-from">Dari</Label>
            <Input
              id="movement-from"
              type="date"
              value={from}
              max={todayKey}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="movement-to">Sampai</Label>
            <Input
              id="movement-to"
              type="date"
              value={to}
              min={from || undefined}
              max={todayKey}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
        </div>

        <ErrorAlert message={error} />

        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Barang</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Referensi</TableHead>
                <TableHead className="text-right">Perubahan</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead>Oleh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.movements.map((m) => (
                <TableRow key={m.id} data-movement={m.type}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {dateTime(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold">{m.productName}</div>
                    <div className="font-mono text-sm text-muted-foreground">{m.productCode}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {MOVEMENT_TYPE_LABELS[m.type]}
                  </TableCell>
                  <TableCell>
                    {m.refNumber ? (
                      <span className="font-mono text-[15px]">{m.refNumber}</span>
                    ) : m.reason ? (
                      <span>
                        {ADJUSTMENT_REASON_LABELS[m.reason]}
                        {m.note && <span className="text-muted-foreground"> · {m.note}</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold whitespace-nowrap tabular-nums',
                      m.qtyChange < 0 && 'text-destructive',
                    )}
                  >
                    {formatQtyChange(m.qtyChange, m.baseUnit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right whitespace-nowrap tabular-nums',
                      m.balanceAfter < 0 && 'font-semibold text-destructive',
                    )}
                  >
                    {formatQty(m.balanceAfter, m.baseUnit)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{m.userName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result && total === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada riwayat stok.</p>
          )}
          {!result && !error && <p className="px-4 py-3 text-muted-foreground">Memuat…</p>}
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground tabular-nums">{total} perubahan stok</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
