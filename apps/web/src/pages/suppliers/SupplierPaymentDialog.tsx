import {
  allocateOldestFirst,
  type DebtPaymentMethod,
  formatRupiah,
  type PurchaseSummary,
  type Supplier,
  type SupplierPayment,
} from '@toko-podomoro/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { ApiRequestError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Kbd } from '../../components/ui/kbd';
import { Label } from '../../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { dayLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { SupplierPicker } from './SupplierPicker';

/**
 * Bayar Hutang: tick purchases (oldest pre-ticked), pay cash or QRIS; the amount fills the
 * oldest ticked first and cannot exceed the ticked total.
 */
export function SupplierPaymentDialog({
  open,
  supplier: preselected,
  onClose,
  onPaid,
}: {
  open: boolean;
  supplier?: Supplier | null;
  onClose: () => void;
  onPaid: (payment: SupplierPayment) => void;
}) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [payables, setPayables] = useState<PurchaseSummary[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<DebtPaymentMethod>('cash');
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per dialog: a retry after a lost response cannot record the payment twice.
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setSupplier(preselected ?? null);
      setMethod('cash');
      setAmount(null);
      setError(null);
      setPaymentId(crypto.randomUUID());
    }
  }, [open, preselected]);

  useEffect(() => {
    setPayables(null);
    if (!supplier) return;
    api
      .listPayables({ supplierId: supplier.id })
      .then((r) => {
        setPayables(r.purchases);
        // Oldest purchase pre-ticked.
        setTicked(new Set(r.purchases.slice(0, 1).map((x) => x.id)));
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [supplier]);

  const tickedList = (payables ?? []).filter((p) => ticked.has(p.id));
  const tickedTotal = tickedList.reduce((sum, p) => sum + p.remaining, 0);
  const preview = new Map(
    allocateOldestFirst(tickedList, Math.min(amount ?? 0, tickedTotal)).map((a) => [
      a.receivableId,
      a.amount,
    ]),
  );
  const tooHigh = (amount ?? 0) > tickedTotal;
  const canPay = supplier !== null && tickedList.length > 0 && (amount ?? 0) > 0 && !tooHigh;

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!supplier || !canPay) {
      setError(
        tooHigh
          ? 'Jumlah bayar tidak boleh melebihi total hutang yang dipilih.'
          : 'Pilih hutang dan isi jumlah bayar.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { payment } = await api.createSupplierPayment({
        id: paymentId,
        supplierId: supplier.id,
        purchaseIds: tickedList.map((p) => p.id),
        method,
        amount: amount ?? 0,
      });
      onPaid(payment);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_PAYMENT') {
        onPaid((await api.getSupplierPayment(paymentId)).payment);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bayar hutang</DialogTitle>
          <DialogDescription>
            {supplier
              ? `${supplier.name} · hutang ${formatRupiah(supplier.balance)}`
              : 'Pilih pemasok.'}
          </DialogDescription>
        </DialogHeader>

        {!supplier ? (
          <SupplierPicker onPick={setSupplier} autoFocus withBalance />
        ) : (
          <form onSubmit={pay} className="space-y-4" noValidate>
            <div className="max-h-[30vh] space-y-1 overflow-y-auto">
              {payables?.length === 0 && (
                <p className="py-4 text-center text-muted-foreground">Tidak ada hutang terbuka.</p>
              )}
              {payables?.map((p) => (
                <label
                  key={p.id}
                  data-payable={p.number}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-row px-3 py-2',
                    ticked.has(p.id) ? 'bg-selected' : 'hover:bg-muted',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ticked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-5 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[15px]">{p.number}</span>
                    <span className="block text-sm text-muted-foreground">
                      {dayLabel(p.date)}
                      {p.note && ` · ${p.note}`}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-semibold">{formatRupiah(p.remaining)}</span>
                    {preview.get(p.id) !== undefined && (
                      <span className="block text-sm text-muted-foreground">
                        dibayar {formatRupiah(preview.get(p.id) ?? 0)}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="label-caps">Hutang dipilih</span>
              <span className="text-2xl font-bold text-warning-foreground tabular-nums">
                {formatRupiah(tickedTotal)}
              </span>
            </div>

            <div className="grid grid-cols-[auto_1fr] items-end gap-4">
              <Tabs value={method} onValueChange={(v) => setMethod(v as DebtPaymentMethod)}>
                <TabsList aria-label="Metode">
                  <TabsTrigger value="cash">Tunai</TabsTrigger>
                  <TabsTrigger value="qris">QRIS</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="supplier-amount">Jumlah bayar</Label>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => setAmount(tickedTotal)}
                  >
                    Lunasi yang dipilih
                  </Button>
                </div>
                <NumberInput
                  id="supplier-amount"
                  value={amount}
                  onValueChange={setAmount}
                  prefix="Rp"
                  autoFocus
                  className="[&_input]:h-14 [&_input]:text-2xl"
                />
              </div>
            </div>

            <ErrorAlert message={error} />
            <div className="flex justify-end gap-3">
              {!preselected && (
                <Button variant="ghost" onClick={() => setSupplier(null)}>
                  Ganti pemasok
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Batal <Kbd>Esc</Kbd>
              </Button>
              <Button type="submit" disabled={busy || !canPay} className="min-w-44">
                {busy ? 'Menyimpan…' : `Bayar ${formatRupiah(amount ?? 0)}`} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
