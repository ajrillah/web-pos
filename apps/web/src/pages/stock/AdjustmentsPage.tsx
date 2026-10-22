import {
  ADJUSTMENT_REASON_LABELS,
  type Adjustment,
  type AdjustmentReason,
  type Product,
} from '@toko-podomoro/shared';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert, TextField } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { ProductPicker } from '../../components/ProductPicker';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { PageHeader } from '../../layout/PageHeader';
import { formatQty, formatQtyChange } from '../../lib/format';
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';

// Opname adjustments come from opname sessions; manual ones use the other reasons.
const REASONS: AdjustmentReason[] = ['rusak', 'kedaluwarsa', 'hilang', 'lainnya'];

/** Stok > Penyesuaian: add or remove stock with a reason; recent adjustments below. */
export function AdjustmentsPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState<AdjustmentReason>('rusak');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Adjustment[] | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .listAdjustments({ limit: 30 })
      .then((r) => setRecent(r.adjustments))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(load, [load]);

  function reset() {
    setProduct(null);
    setQty(null);
    setNote('');
    setTimeout(() => pickerRef.current?.focus(), 0);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!product) return setError('Pilih barang.');
    if (!qty) return setError('Isi jumlah.');
    if (reason === 'lainnya' && !note.trim()) return setError('Tulis keterangan untuk "Lainnya".');
    setBusy(true);
    setError(null);
    try {
      const { adjustment, warnings } = await api.createAdjustment({
        productId: product.id,
        qtyChange: direction === 'out' ? -qty : qty,
        reason,
        note: note.trim() || null,
      });
      toast.success(
        `${adjustment.productName}: ${formatQtyChange(adjustment.qtyChange, adjustment.baseUnit)}`,
      );
      for (const w of warnings) {
        toast.warning(`Stok ${w.productName} sekarang ${formatQty(w.stock, w.baseUnit)}.`);
      }
      reset();
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Penyesuaian stok"
        description="Catat barang rusak, kedaluwarsa, hilang, atau koreksi lain."
      />
      <div className="space-y-5">
        <Card className="p-6">
          <form onSubmit={save} className="space-y-4" noValidate>
            {product ? (
              <div className="flex h-12 items-center justify-between rounded-control border border-input bg-card px-4">
                <span>
                  <span className="font-semibold" data-testid="chosen-product">
                    {product.name}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    <span className="font-mono">{product.code}</span> · stok{' '}
                    {formatQty(product.stock, product.baseUnit)}
                  </span>
                </span>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={reset}>
                  Ganti
                </Button>
              </div>
            ) : (
              <ProductPicker
                id="adjust-product"
                inputRef={pickerRef}
                autoFocus
                onPick={(p) => {
                  setProduct(p);
                  setTimeout(() => document.getElementById('adjust-qty')?.focus(), 0);
                }}
              />
            )}
            <div className="grid grid-cols-[auto_220px_1fr] items-end gap-4">
              <Tabs value={direction} onValueChange={(v) => setDirection(v as 'out' | 'in')}>
                <TabsList aria-label="Arah">
                  <TabsTrigger value="out">Kurangi</TabsTrigger>
                  <TabsTrigger value="in">Tambah</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-qty">Jumlah</Label>
                <NumberInput
                  id="adjust-qty"
                  value={qty}
                  onValueChange={setQty}
                  {...(product ? { suffix: product.baseUnit } : {})}
                />
              </div>
              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-sm font-semibold text-muted-foreground">
                  Alasan
                </legend>
                <div className="flex gap-2">
                  {REASONS.map((value) => (
                    <label
                      key={value}
                      className={cn(
                        'flex h-12 flex-1 cursor-pointer items-center justify-center rounded-control border px-3 font-semibold whitespace-nowrap transition-colors',
                        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-primary-soft',
                        reason === value
                          ? 'border-primary bg-selected text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <input
                        type="radio"
                        name="adjust-reason"
                        value={value}
                        data-reason={value}
                        checked={reason === value}
                        onChange={() => setReason(value)}
                        className="sr-only"
                      />
                      {ADJUSTMENT_REASON_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <TextField
              id="adjust-note"
              label={reason === 'lainnya' ? 'Keterangan' : 'Keterangan (opsional)'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              maxLength={200}
            />
            <ErrorAlert message={error} />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy} className="min-w-44">
                {busy ? 'Menyimpan…' : 'Simpan penyesuaian'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="px-3 py-4">
          <h2 className="px-3 pb-2 text-lg font-semibold">Penyesuaian terakhir</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Barang</TableHead>
                <TableHead className="text-right">Perubahan</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead>Oleh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent?.map((a) => (
                <TableRow key={a.id} data-adjustment={a.productCode}>
                  <TableCell className="tabular-nums">{dateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{a.productName}</div>
                    <div className="font-mono text-sm text-muted-foreground">{a.productCode}</div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      a.qtyChange < 0 && 'text-destructive',
                    )}
                  >
                    {formatQtyChange(a.qtyChange, a.baseUnit)}
                  </TableCell>
                  <TableCell>
                    {ADJUSTMENT_REASON_LABELS[a.reason]}
                    {a.note && <span className="text-muted-foreground"> · {a.note}</span>}
                  </TableCell>
                  <TableCell>{a.userName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {recent?.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada penyesuaian.</p>
          )}
        </Card>
      </div>
    </section>
  );
}
