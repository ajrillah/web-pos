import {
  type CreateSaleResponse,
  type Customer,
  formatRupiah,
  type SaleLineInput,
} from '@toko-podomoro/shared';
import { ArrowLeft, Banknote, CreditCard, Landmark } from 'lucide-react';
import { type ComponentType, type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';
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
import { cn } from '../../lib/utils';
import { CustomerPicker } from '../customers/CustomerPicker';

type Method = 'tunai' | 'qris' | 'transfer';
type Step = 'customer' | 'total' | 'method' | 'amount' | 'kasbon';

const METHODS: {
  key: Method;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  hint: string;
}[] = [
  { key: 'tunai', label: 'Tunai', icon: Banknote, hint: 'Kembalian hanya dari tunai.' },
  { key: 'qris', label: 'QRIS', icon: CreditCard, hint: 'Tidak boleh melebihi total.' },
  { key: 'transfer', label: 'Transfer bank', icon: Landmark, hint: 'Tidak boleh melebihi total.' },
];

/** Preset tunai buttons alongside "Uang pas". */
const TUNAI_PRESETS = [50_000, 100_000, 200_000, 500_000];

/**
 * Bayar (F8) as a sequential flow: pelanggan → total → metode → jumlah. Underpayment moves to
 * the kasbon step, which shows the shortfall and the customer's new balance (Enter confirms,
 * Esc goes back). `saleId` stays the same for retries, so a lost response never books twice.
 */
export function PayDialog({
  open,
  saleId,
  total,
  lines,
  customer,
  onCustomerChange,
  onClose,
  onPaid,
  onTotalChanged,
  onClosed,
}: {
  open: boolean;
  saleId: string;
  total: number;
  lines: SaleLineInput[];
  customer: Customer | null;
  onCustomerChange: (customer: Customer | null) => void;
  onClose: () => void;
  onPaid: (result: CreateSaleResponse) => void;
  /** The server's total differs: Kasir refreshes the cart prices. */
  onTotalChanged: () => void;
  onClosed: () => void;
}) {
  const [step, setStep] = useState<Step>('customer');
  const [method, setMethod] = useState<Method>('tunai');
  const [methodHighlight, setMethodHighlight] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('customer');
      setMethod('tunai');
      setMethodHighlight(0);
      setAmount(null);
      setError(null);
    }
  }, [open]);

  // Payment breakdown — the chosen method carries the entered amount; the others stay 0.
  const paid = amount ?? 0;
  const cash = method === 'tunai' ? paid : 0;
  const qris = method === 'qris' ? paid : 0;
  const transfer = method === 'transfer' ? paid : 0;
  const change = method === 'tunai' ? Math.max(0, cash - total) : 0;
  const shortfall = Math.max(0, total - paid);
  const nonCashTooHigh = (method === 'qris' || method === 'transfer') && paid > total;

  function back() {
    setError(null);
    if (step === 'total') setStep('customer');
    else if (step === 'method') setStep('total');
    else if (step === 'amount') setStep('method');
    else if (step === 'kasbon') setStep('amount');
  }

  function next() {
    setError(null);
    if (step === 'customer') {
      setStep('total');
      return;
    }
    if (step === 'total') {
      setStep('method');
      return;
    }
    if (step === 'method') {
      setMethod(METHODS[methodHighlight]?.key ?? 'tunai');
      setAmount(null);
      setStep('amount');
      return;
    }
    if (step === 'amount') submitFromAmount();
  }

  function submitFromAmount() {
    if (nonCashTooHigh) {
      setError(
        method === 'qris'
          ? 'QRIS tidak boleh melebihi total.'
          : 'Transfer tidak boleh melebihi total.',
      );
      return;
    }
    if (paid < total) {
      setStep('kasbon');
      return;
    }
    void submitSale();
  }

  async function submitSale() {
    setBusy(true);
    setError(null);
    try {
      onPaid(
        await api.createSale({
          id: saleId,
          lines,
          cash,
          qris,
          transfer,
          expectedTotal: total,
          ...(customer ? { customerId: customer.id } : {}),
        }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_SALE') {
        onPaid({ sale: (await api.getSale(saleId)).sale, warnings: [] });
        return;
      }
      if (err instanceof ApiRequestError && err.code === 'TOTAL_CHANGED') onTotalChanged();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onFormKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  }

  function onMethodKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setMethodHighlight((h) => Math.min(h + 1, METHODS.length - 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setMethodHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  }

  const stepLabel: Record<Step, string> = {
    customer: 'Pelanggan',
    total: 'Total',
    method: 'Metode',
    amount: 'Jumlah',
    kasbon: 'Kasbon',
  };

  const quickCash = [
    { label: 'Uang pas', value: total },
    ...TUNAI_PRESETS.filter((v) => v > total).map((v) => ({ label: formatRupiah(v), value: v })),
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-xl"
        onEscapeKeyDown={(e) => {
          if (step !== 'customer') {
            e.preventDefault();
            back();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>Bayar · {stepLabel[step]}</DialogTitle>
          <DialogDescription>
            {step === 'customer' && 'Pilih pelanggan (opsional) atau lewati dengan Enter.'}
            {step === 'total' && 'Tekan Enter untuk melanjutkan ke metode pembayaran.'}
            {step === 'method' && 'Pilih metode dengan panah, Enter untuk lanjut.'}
            {step === 'amount' && 'Masukkan jumlah atau pilih tombol cepat. Enter untuk selesai.'}
            {step === 'kasbon' && 'Kekurangan dicatat sebagai kasbon pelanggan.'}
          </DialogDescription>
        </DialogHeader>

        <TotalCard total={total} shortfall={step === 'kasbon' ? shortfall : 0} />

        {step === 'customer' && (
          <div className="space-y-3">
            {customer ? (
              <div className="flex items-center justify-between rounded-[20px] bg-selected px-5 py-3">
                <span>
                  <span className="block font-semibold" data-testid="pay-customer">
                    {customer.name}
                  </span>
                  {customer.balance > 0 && (
                    <span className="block text-sm text-warning-foreground">
                      Kasbon {formatRupiah(customer.balance)}
                    </span>
                  )}
                </span>
                <Button variant="ghost" size="sm" onClick={() => onCustomerChange(null)}>
                  Ganti
                </Button>
              </div>
            ) : (
              <CustomerPicker onPick={onCustomerChange} autoFocus />
            )}
            <ErrorAlert message={error} />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Tutup <Kbd>Esc</Kbd>
              </Button>
              <Button
                onClick={next}
                className="min-w-40"
                data-autofocus={customer ? true : undefined}
              >
                {customer ? 'Lanjut' : 'Lewati'} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </div>
        )}

        {step === 'total' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              next();
            }}
            className="space-y-3"
          >
            <p className="text-muted-foreground">
              Pelanggan:{' '}
              <span className="font-semibold text-foreground">{customer?.name ?? 'UMUM'}</span>
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden /> Kembali <Kbd>Esc</Kbd>
              </Button>
              <Button type="submit" className="min-w-40" data-autofocus>
                Lanjut <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}

        {step === 'method' && (
          <div className="space-y-3">
            <div
              role="listbox"
              aria-label="Metode pembayaran"
              tabIndex={0}
              onKeyDown={onMethodKey}
              // biome-ignore lint/a11y/noAutofocus: step opens inside the dialog.
              autoFocus
              className="space-y-1.5 rounded-control border border-input bg-card p-1.5 outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
            >
              {METHODS.map((m, index) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.key}
                    role="option"
                    aria-selected={methodHighlight === index}
                    tabIndex={-1}
                    data-method={m.key}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setMethodHighlight(index);
                      setMethod(m.key);
                      setAmount(null);
                      setStep('amount');
                    }}
                    onMouseEnter={() => setMethodHighlight(index)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-4 rounded-row px-4 py-3 text-[17px]',
                      methodHighlight === index && 'bg-selected',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-10 items-center justify-center rounded-full',
                          methodHighlight === index
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span>
                        <span className="block font-semibold">{m.label}</span>
                        <span className="block text-sm text-muted-foreground">{m.hint}</span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <ErrorAlert message={error} />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden /> Kembali <Kbd>Esc</Kbd>
              </Button>
              <Button onClick={next} className="min-w-40">
                Lanjut <Kbd>Enter</Kbd>
              </Button>
            </div>
          </div>
        )}

        {step === 'amount' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              submitFromAmount();
            }}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <p className="label-caps">
                {method === 'tunai' ? 'Tunai' : method === 'qris' ? 'QRIS' : 'Transfer bank'}
              </p>
              <NumberInput
                id="pay-amount"
                value={amount}
                onValueChange={setAmount}
                onKeyDown={onFormKey}
                prefix="Rp"
                autoFocus
                className="[&_input]:h-14 [&_input]:text-2xl"
              />
              <div className="flex flex-wrap gap-2">
                {method === 'tunai' ? (
                  quickCash.map((q) => (
                    <Button
                      key={q.label}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="tabular-nums"
                      data-quick={q.label}
                      onClick={() => setAmount(q.value)}
                    >
                      {q.label}
                    </Button>
                  ))
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-quick="Uang pas"
                    onClick={() => setAmount(total)}
                  >
                    Uang pas
                  </Button>
                )}
              </div>
            </div>

            {method === 'tunai' && (
              <div className="flex items-baseline justify-between border-t border-border pt-4">
                <span className="label-caps">{paid >= total ? 'Kembalian' : 'Kurang'}</span>
                <span
                  data-testid="pay-change"
                  className={cn(
                    'text-[32px] font-bold tabular-nums',
                    paid >= total ? 'text-success' : 'text-destructive',
                  )}
                >
                  {formatRupiah(paid >= total ? change : total - paid)}
                </span>
              </div>
            )}

            <ErrorAlert message={error} />

            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden /> Kembali <Kbd>Esc</Kbd>
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={busy || !amount || nonCashTooHigh}
                className="min-w-48"
              >
                {busy ? 'Menyimpan…' : shortfall > 0 ? 'Kasbon…' : 'Selesai'} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}

        {step === 'kasbon' && (
          <div className="space-y-4">
            {customer ? (
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
                <Button variant="ghost" size="sm" onClick={() => onCustomerChange(null)}>
                  Ganti
                </Button>
              </div>
            ) : (
              <CustomerPicker onPick={onCustomerChange} autoFocus />
            )}
            <ErrorAlert message={error} />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden /> Kembali <Kbd>Esc</Kbd>
              </Button>
              <Button
                onClick={() => void submitSale()}
                disabled={busy || !customer}
                data-autofocus={customer ? true : undefined}
                className="min-w-48"
              >
                {busy ? 'Menyimpan…' : 'Catat kasbon'} <Kbd>Enter</Kbd>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TotalCard({ total, shortfall }: { total: number; shortfall: number }) {
  return (
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
      {shortfall > 0 && (
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
  );
}
