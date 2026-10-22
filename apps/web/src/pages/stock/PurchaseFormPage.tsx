import {
  formatPercentBp,
  formatRupiah,
  localDate,
  type PaymentMethod,
  type Product,
  type Supplier,
} from '@toko-podomoro/shared';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiRequestError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useApproval } from '../../approval/ApprovalProvider';
import { useCurrentUser } from '../../auth/AuthProvider';
import { ErrorAlert } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { PinHint } from '../../components/PinHint';
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
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { PageHeader } from '../../layout/PageHeader';
import { formatQty } from '../../lib/format';
import { cn } from '../../lib/utils';
import { SupplierPicker } from '../suppliers/SupplierPicker';
import { pricingUnit } from './PurchaseDetailDialog';
import {
  costChanged,
  costOptions,
  lineProblem,
  marginOf,
  newLine,
  type PurchaseLine,
  purchaseTotal,
  subtotalOf,
  toLineInputs,
  unitOf,
} from './purchase-lines';

/** Stok > Stok masuk baru: supplier, lines with buy price and new cost, initial payment. */
export function PurchaseFormPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { withApproval } = useApproval();
  const todayKey = localDate(new Date());
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState(todayKey);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [paid, setPaid] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per form: a retry after a lost response cannot record the purchase twice.
  const [purchaseId] = useState(() => crypto.randomUUID());
  const pickerRef = useRef<HTMLInputElement>(null);

  const total = purchaseTotal(lines);
  const paidAmount = Math.min(paid ?? 0, total);
  const debt = total - paidAmount;
  const anyCostChange = lines.some(costChanged);

  function update(key: string, patch: Partial<PurchaseLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function add(product: Product) {
    if (lines.some((l) => l.product.id === product.id)) {
      setError(`${product.name} sudah ada di daftar.`);
      return;
    }
    setError(null);
    const line = newLine(product);
    setLines((current) => [...current, line]);
    api
      .costSuggestion(product.id)
      .then((suggestion) => update(line.key, { suggestion }))
      .catch(() => {
        // Suggestions are optional; the line works without them.
      });
    // Focus the new line's quantity once it renders.
    setTimeout(() => document.getElementById(`qty-${line.key}`)?.focus(), 0);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = !supplier ? 'Pilih pemasok.' : lineProblem(lines);
    if (problem || !supplier) {
      setError(problem);
      return;
    }
    if ((paid ?? 0) > total) {
      setError('Jumlah dibayar tidak boleh melebihi total.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      id: purchaseId,
      supplierId: supplier.id,
      date,
      note: note.trim() || null,
      lines: toLineInputs(lines),
      paidAmount,
      paidMethod: method,
    };
    try {
      let purchase: { id: string; number: string };
      try {
        ({ purchase } = await withApproval('purchase.cost', purchaseId, (token) =>
          api.createPurchase(body, token),
        ));
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.code === 'DUPLICATE_PURCHASE')) throw err;
        ({ purchase } = await api.getPurchase(purchaseId));
      }
      toast.success(`${purchase.number} tersimpan.`);
      navigate(`/stok?buka=${purchase.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-6xl">
      <Link
        to="/stok"
        className="mb-3 inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Stok masuk
      </Link>
      <PageHeader
        title="Stok masuk baru"
        description="Stok bertambah saat disimpan. Stok masuk tidak dapat diubah, hanya dibatalkan."
      />
      <form onSubmit={save} className="space-y-5" noValidate>
        <Card className="grid grid-cols-[1fr_200px_1fr] items-start gap-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-search">Pemasok</Label>
            {supplier ? (
              <div className="flex h-12 items-center justify-between rounded-control border border-input bg-card px-4">
                <span className="font-semibold" data-testid="chosen-supplier">
                  {supplier.name}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setSupplier(null)}
                >
                  Ganti
                </Button>
              </div>
            ) : (
              <SupplierPicker
                onPick={(s) => {
                  setSupplier(s);
                  setTimeout(() => pickerRef.current?.focus(), 0);
                }}
                autoFocus
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase-date">Tanggal</Label>
            <Input
              id="purchase-date"
              type="date"
              value={date}
              max={todayKey}
              onChange={(e) => setDate(e.target.value || todayKey)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase-note">Catatan (opsional)</Label>
            <Input
              id="purchase-note"
              placeholder="No. faktur, dll."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              maxLength={200}
            />
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Barang masuk</h2>
            {user.role === 'cashier' && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                Mengubah harga modal perlu persetujuan pemilik <PinHint />
              </p>
            )}
          </div>
          <ProductPicker
            id="purchase-product"
            inputRef={pickerRef}
            onPick={add}
            placeholder="Tambah barang: kode atau nama"
          />
          <div className="space-y-3">
            {lines.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">Belum ada barang.</p>
            )}
            {lines.map((line) => (
              <LineEditor
                key={line.key}
                line={line}
                onChange={(patch) => update(line.key, patch)}
                onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              />
            ))}
          </div>
        </Card>

        <Card className="grid grid-cols-[1fr_auto] items-end gap-8 p-6">
          <div className="grid grid-cols-[auto_1fr] items-end gap-4">
            <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <TabsList aria-label="Metode bayar">
                <TabsTrigger value="cash">Tunai</TabsTrigger>
                <TabsTrigger value="qris">QRIS</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="max-w-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="purchase-paid">Dibayar sekarang</Label>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setPaid(total)}
                >
                  Bayar lunas
                </Button>
              </div>
              <NumberInput id="purchase-paid" value={paid} onValueChange={setPaid} prefix="Rp" />
            </div>
          </div>
          <dl className="min-w-72 space-y-1 tabular-nums">
            <div className="flex items-baseline justify-between gap-6">
              <dt className="label-caps">Total</dt>
              <dd className="text-3xl font-bold" data-testid="purchase-total">
                {formatRupiah(total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <dt className="text-muted-foreground">Sisa jadi hutang</dt>
              <dd
                className={cn('text-lg font-semibold', debt > 0 && 'text-warning-foreground')}
                data-testid="purchase-debt"
              >
                {formatRupiah(debt)}
              </dd>
            </div>
          </dl>
        </Card>

        <ErrorAlert message={error} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" asChild>
            <Link to="/stok">Batal</Link>
          </Button>
          <Button type="submit" size="lg" disabled={busy} className="min-w-52">
            {busy ? 'Menyimpan…' : 'Simpan stok masuk'}
            {anyCostChange && user.role === 'cashier' && <PinHint />}
          </Button>
        </div>
      </form>
    </section>
  );
}

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: PurchaseLine;
  onChange: (patch: Partial<PurchaseLine>) => void;
  onRemove: () => void;
}) {
  const { product } = line;
  const unit = unitOf(line);
  const bulk = product.type === 'bulk';
  const options = costOptions(line);
  const margin = marginOf(line);
  const costUnit = pricingUnit(product.pricingFactor, product.baseUnit);
  const primary = product.units.find((u) => u.isBase);
  const chips: { label: string; value: number | null }[] = [
    { label: 'Modal sekarang', value: product.costPrice },
    { label: 'Harga beli ini', value: options.thisBuy },
    { label: 'Beli terakhir', value: options.lastBuy },
    { label: 'Rata-rata', value: options.average },
  ];

  return (
    <div className="space-y-3 rounded-row border border-border px-4 py-3" data-line={product.code}>
      <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_170px_130px_40px] items-end gap-3">
        <div className="min-w-0 pb-2">
          <div className="truncate font-semibold">{product.name}</div>
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{product.code}</span> · stok{' '}
            {formatQty(product.stock, product.baseUnit)}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`unit-${line.key}`} className="text-xs">
            Satuan
          </Label>
          {bulk ? (
            <div className="flex h-12 items-center px-1 text-muted-foreground">{unit?.name}</div>
          ) : (
            <Select value={line.unitId} onValueChange={(unitId) => onChange({ unitId })}>
              <SelectTrigger id={`unit-${line.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {product.units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                    {u.factor > 1 && ` (${u.factor} ${product.baseUnit})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`qty-${line.key}`} className="text-xs">
            Jumlah
          </Label>
          <NumberInput
            id={`qty-${line.key}`}
            data-qty-input={product.code}
            value={line.qty}
            onValueChange={(qty) => onChange({ qty })}
            suffix={bulk ? product.baseUnit : (unit?.name ?? '')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`buy-${line.key}`} className="text-xs">
            Harga beli / {unit?.name}
          </Label>
          <NumberInput
            id={`buy-${line.key}`}
            data-buy-input={product.code}
            value={line.buyPrice}
            onValueChange={(buyPrice) => onChange({ buyPrice })}
            prefix="Rp"
          />
        </div>
        <div className="pb-3 text-right">
          <div className="text-xs text-muted-foreground">Subtotal</div>
          <div className="font-semibold tabular-nums">{formatRupiah(subtotalOf(line))}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Hapus ${product.name}`}
          onClick={onRemove}
          className="mb-1 text-destructive hover:bg-destructive-soft"
        >
          <Trash2 className="size-[18px]" aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-[170px_minmax(0,1fr)_auto] items-center gap-3">
        <div className="space-y-1">
          <Label htmlFor={`cost-${line.key}`} className="text-xs">
            Harga modal baru / {costUnit}
          </Label>
          <NumberInput
            id={`cost-${line.key}`}
            data-cost-input={product.code}
            value={line.newCostPrice}
            onValueChange={(newCostPrice) => onChange({ newCostPrice })}
            prefix="Rp"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-5">
          {chips.map(
            (chip) =>
              chip.value !== null && (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onChange({ newCostPrice: chip.value })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm tabular-nums transition-colors outline-none',
                    'focus-visible:ring-[3px] focus-visible:ring-primary-soft',
                    line.newCostPrice === chip.value
                      ? 'border-primary bg-selected font-semibold text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  {chip.label} {formatRupiah(chip.value)}
                </button>
              ),
          )}
        </div>
        <div className="pt-5 text-right text-sm">
          {costChanged(line) && (
            <span className="mr-3 font-semibold text-warning-foreground">Modal berubah</span>
          )}
          {margin !== null && (
            <span
              className={cn(
                'tabular-nums',
                margin < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground',
              )}
            >
              Margin {primary?.name} {formatPercentBp(margin)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
