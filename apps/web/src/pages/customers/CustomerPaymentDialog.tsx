import {
  allocateOldestFirst,
  type Customer,
  type CustomerPayment,
  type DebtPaymentMethod,
  formatRupiah,
  type Receivable,
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
import { cn } from '../../lib/utils';
import { CustomerPicker } from './CustomerPicker';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Bayar Kasbon: tick receivables (oldest pre-ticked), pay cash or QRIS; the amount fills the
 * oldest ticked first. Cash returns change; QRIS may not exceed the ticked total.
 */
export function CustomerPaymentDialog({
  open,
  customer: preselected,
  onClose,
  onPaid,
  onClosed,
}: {
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onPaid: (payment: CustomerPayment) => void;
  onClosed?: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [receivables, setReceivables] = useState<Receivable[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<DebtPaymentMethod>('cash');
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per dialog: a retry after a lost response cannot record the payment twice.
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setCustomer(preselected ?? null);
      setMethod('cash');
      setAmount(null);
      setError(null);
      setPaymentId(crypto.randomUUID());
    }
  }, [open, preselected]);

  useEffect(() => {
    setReceivables(null);
    if (!customer) return;
    api
      .listReceivables({ customerId: customer.id })
      .then((r) => {
        setReceivables(r.receivables);
        // Oldest receivable pre-ticked.
        setTicked(new Set(r.receivables.slice(0, 1).map((x) => x.id)));
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [customer]);

  const tickedList = (receivables ?? []).filter((r) => ticked.has(r.id));
  const tickedTotal = tickedList.reduce((sum, r) => sum + r.remaining, 0);
  const applied = Math.min(amount ?? 0, tickedTotal);
  const preview = new Map(
    allocateOldestFirst(tickedList, applied).map((a) => [a.receivableId, a.amount]),
  );
  const change = method === 'cash' ? Math.max(0, (amount ?? 0) - tickedTotal) : 0;
  const qrisTooHigh = method === 'qris' && (amount ?? 0) > tickedTotal;
  const canPay = customer !== null && tickedList.length > 0 && (amount ?? 0) > 0 && !qrisTooHigh;

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!customer || !canPay) {
      setError(
        qrisTooHigh
          ? 'QRIS tidak boleh melebihi total kasbon yang dipilih.'
          : 'Pilih kasbon dan isi jumlah bayar.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { payment } = await api.createCustomerPayment({
        id: paymentId,
        customerId: customer.id,
        receivableIds: tickedList.map((r) => r.id),
        method,
        amount: amount ?? 0,
      });
      onPaid(payment);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_PAYMENT') {
        onPaid((await api.getCustomerPayment(paymentId)).payment);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onCloseAutoFocus={(e) => {
          if (onClosed) {
            e.preventDefault();
            onClosed();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Bayar kasbon</DialogTitle>
          <DialogDescription>
            {customer
              ? `${customer.name} · kasbon ${formatRupiah(customer.balance)}`
              : 'Pilih pelanggan.'}
          </DialogDescription>
        </DialogHeader>

        {!customer ? (
          <CustomerPicker onPick={setCustomer} autoFocus />
        ) : (
          <form onSubmit={pay} className="space-y-4" noValidate>
            <div className="max-h-[30vh] space-y-1 overflow-y-auto">
              {receivables?.length === 0 && (
                <p className="py-4 text-center text-muted-foreground">Tidak ada kasbon terbuka.</p>
              )}
              {receivables?.map((r) => (
                <label
                  key={r.id}
                  data-receivable={r.saleNumber}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-row px-3 py-2',
                    ticked.has(r.id) ? 'bg-selected' : 'hover:bg-muted',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ticked.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="size-5 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[15px]">{r.saleNumber}</span>
                    <span className="block text-sm text-muted-foreground">{date(r.createdAt)}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-semibold">{formatRupiah(r.remaining)}</span>
                    {preview.get(r.id) !== undefined && (
                      <span className="block text-sm text-muted-foreground">
                        dibayar {formatRupiah(preview.get(r.id) ?? 0)}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="label-caps">Kasbon dipilih</span>
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
                  <Label htmlFor="kasbon-amount">
                    {method === 'cash' ? 'Uang diterima' : 'Jumlah QRIS'}
                  </Label>
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
                  id="kasbon-amount"
                  value={amount}
                  onValueChange={setAmount}
                  prefix="Rp"
                  autoFocus
                  className="[&_input]:h-14 [&_input]:text-2xl"
                />
              </div>
            </div>

            {method === 'cash' && change > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="label-caps">Kembalian</span>
                <span className="text-2xl font-bold text-success tabular-nums">
                  {formatRupiah(change)}
                </span>
              </div>
            )}

            <ErrorAlert message={error} />
            <div className="flex justify-end gap-3">
              {!preselected && (
                <Button variant="ghost" onClick={() => setCustomer(null)}>
                  Ganti pelanggan
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Batal <Kbd>Esc</Kbd>
              </Button>
              <Button type="submit" disabled={busy || !canPay} className="min-w-44">
                {busy ? 'Menyimpan…' : `Bayar ${formatRupiah(applied)}`} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
