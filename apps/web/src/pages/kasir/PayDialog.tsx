import {
  type CreateSaleResponse,
  type Customer,
  formatRupiah,
  quickCashAmounts,
  type SaleLineInput,
} from '@toko-podomoro/shared';
import { ArrowLeft } from 'lucide-react';
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
import { cn } from '../../lib/utils';
import { CustomerPicker } from '../customers/CustomerPicker';

/**
 * Bayar (F8): cash and/or QRIS against the rounded total. Enter pays when the amount is enough;
 * with less, Enter moves to the kasbon step (pick or quick-add a customer, Enter confirms,
 * Esc goes back). `saleId` stays the same for retries, so a lost response never books twice.
 */
export function PayDialog({
  open,
  saleId,
  total,
  lines,
  onClose,
  onPaid,
  onTotalChanged,
  onClosed,
}: {
  open: boolean;
  saleId: string;
  total: number;
  lines: SaleLineInput[];
  onClose: () => void;
  onPaid: (result: CreateSaleResponse) => void;
  /** The server's total differs: Kasir refreshes the cart prices. */
  onTotalChanged: () => void;
  onClosed: () => void;
}) {
  const [cash, setCash] = useState<number | null>(null);
  const [qris, setQris] = useState<number | null>(null);
  const [step, setStep] = useState<'pay' | 'kasbon'>('pay');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCash(null);
      setQris(null);
      setStep('pay');
      setCustomer(null);
      setError(null);
    }
  }, [open]);

  const paid = (cash ?? 0) + (qris ?? 0);
  const change = paid - total;
  const shortfall = Math.max(0, total - paid);
  const qrisTooHigh = (qris ?? 0) > total;

  async function submitSale(kasbonCustomer: Customer | null) {
    setBusy(true);
    setError(null);
    try {
      onPaid(
        await api.createSale({
          id: saleId,
          lines,
          cash: cash ?? 0,
          qris: qris ?? 0,
          expectedTotal: total,
          ...(kasbonCustomer ? { customerId: kasbonCustomer.id } : {}),
        }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_SALE') {
        // An earlier attempt was saved but its answer was lost: continue with that sale.
        onPaid({ sale: (await api.getSale(saleId)).sale, warnings: [] });
        return;
      }
      if (err instanceof ApiRequestError && err.code === 'TOTAL_CHANGED') onTotalChanged();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function pay(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (qrisTooHigh) {
      setError('QRIS tidak boleh melebihi total.');
      return;
    }
    if (shortfall > 0) {
      setError(null);
      setStep('kasbon');
      return;
    }
    void submitSale(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-xl"
        onEscapeKeyDown={(e) => {
          // Esc in the kasbon step goes back to the amounts instead of closing.
          if (step === 'kasbon') {
            e.preventDefault();
            setStep('pay');
            setCustomer(null);
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>{step === 'pay' ? 'Bayar' : 'Catat kasbon'}</DialogTitle>
          <DialogDescription>
            {step === 'pay'
              ? 'Tunai dan/atau QRIS. Kembalian hanya dari tunai.'
              : 'Kekurangan dicatat sebagai kasbon pelanggan.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] bg-muted px-5 py-4">
            <div className="label-caps">Total</div>
            <div
              className="text-[36px] leading-tight font-bold tracking-[-0.03em] tabular-nums"
              data-testid="pay-total"
            >
              {formatRupiah(total)}
            </div>
          </div>
          {step === 'kasbon' && (
            <div className="rounded-[20px] border border-warning-border bg-warning-soft px-5 py-4 text-warning-foreground">
              <div className="label-caps text-current">Kasbon</div>
              <div
                className="text-[36px] leading-tight font-bold tracking-[-0.03em] tabular-nums"
                data-testid="kasbon-amount"
              >
                {formatRupiah(shortfall)}
              </div>
            </div>
          )}
        </div>

        {step === 'kasbon' ? (
          <div className="space-y-4">
            {customer ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-[20px] bg-selected px-5 py-4">
                  <div>
                    <div className="text-lg font-semibold" data-testid="kasbon-customer">
                      {customer.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Kasbon sekarang {formatRupiah(customer.balance)} → menjadi{' '}
                      <span className="font-semibold text-warning-foreground">
                        {formatRupiah(customer.balance + shortfall)}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                    Ganti
                  </Button>
                </div>
                <ErrorAlert message={error} />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStep('pay');
                      setCustomer(null);
                    }}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Kembali <Kbd>Esc</Kbd>
                  </Button>
                  <Button
                    onClick={() => void submitSale(customer)}
                    disabled={busy}
                    autoFocus
                    className="min-w-48"
                  >
                    {busy ? 'Menyimpan…' : 'Catat kasbon'} <Kbd>Enter</Kbd>
                  </Button>
                </div>
              </div>
            ) : (
              <CustomerPicker onPick={setCustomer} autoFocus />
            )}
          </div>
        ) : (
          <form onSubmit={pay} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="pay-cash">Tunai</Label>
              <NumberInput
                id="pay-cash"
                value={cash}
                onValueChange={setCash}
                prefix="Rp"
                autoFocus
                className="[&_input]:h-14 [&_input]:text-2xl"
              />
              <div className="flex flex-wrap gap-2">
                {quickCashAmounts(total).map((amount, i) => (
                  <Button
                    key={amount}
                    variant="secondary"
                    size="sm"
                    className="tabular-nums"
                    onClick={() => {
                      setCash(amount);
                      setQris(null);
                    }}
                  >
                    {i === 0 ? 'Uang pas' : formatRupiah(amount)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pay-qris">QRIS</Label>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setQris(total);
                    setCash(null);
                  }}
                >
                  QRIS penuh
                </Button>
              </div>
              <NumberInput id="pay-qris" value={qris} onValueChange={setQris} prefix="Rp" />
            </div>

            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <span className="label-caps">{change >= 0 ? 'Kembalian' : 'Kurang'}</span>
              <span
                data-testid="pay-change"
                className={cn(
                  'text-[32px] font-bold tabular-nums',
                  change >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {formatRupiah(Math.abs(change))}
              </span>
            </div>

            <ErrorAlert message={error} />

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Kembali <Kbd>Esc</Kbd>
              </Button>
              <Button type="submit" size="lg" disabled={busy || qrisTooHigh} className="min-w-48">
                {busy ? 'Menyimpan…' : shortfall > 0 ? 'Kasbon…' : 'Selesai'} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
