import {
  type CustomerPayment,
  formatRupiah,
  localDate,
  type Product,
  type Sale,
  type Settings,
} from '@toko-podomoro/shared';
import { Lock, PauseCircle } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth, useCurrentUser } from '../../auth/AuthProvider';
import { BrandMark } from '../../components/BrandMark';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AmountBlock, ReceiptPromptDialog } from '../../components/receipts/ReceiptPromptDialog';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Kbd } from '../../components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { useShortcutHandlers } from '../../keyboard/ShortcutLayer';
import { cn } from '../../lib/utils';
import { roleLabels } from '../../navigation/menu';
import { CustomerPaymentDialog } from '../customers/CustomerPaymentDialog';
import { PaymentSummary } from '../customers/PaymentSummary';
import { CartTable } from './CartTable';
import { cartReducer, cartTotals, emptyCart, saleLines } from './cart';
import { HeldSalesDialog, isFromEarlierDay } from './HeldSalesDialog';
import { PayDialog } from './PayDialog';
import { ProductSearch } from './ProductSearch';
import { WeightDialog } from './WeightDialog';

type OpenDialog = 'pay' | 'held' | 'cancel' | 'kasbon-payment' | null;

const FOOTER_KEYS: { key: string; label: string; path?: string }[] = [
  { key: 'F2', label: 'Cari' },
  { key: 'F8', label: 'Bayar' },
  { key: 'F9', label: 'Tahan' },
  { key: 'Esc', label: 'Batal' },
  { key: 'F6', label: 'Riwayat', path: '/riwayat' },
  { key: 'F3', label: 'Barang', path: '/barang' },
  { key: 'F4', label: 'Stok', path: '/stok' },
  { key: 'F5', label: 'Pelanggan', path: '/pelanggan' },
];

const today = () =>
  new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** Kasir: full screen, no sidebar. Layout locked in docs/ui-style.md section 5. */
export function KasirPage() {
  const user = useCurrentUser();
  const { lock } = useAuth();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [heldSales, setHeldSales] = useState<Sale[]>([]);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [weighing, setWeighing] = useState<Product | null>(null);
  const [completed, setCompleted] = useState<Sale | null>(null);
  const [paidKasbon, setPaidKasbon] = useState<CustomerPayment | null>(null);
  // One id per cart: retries of the same payment reuse it (the server rejects duplicates).
  const [saleId, setSaleId] = useState(() => crypto.randomUUID());
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Auto-hold: when the Kasir screen unmounts with items still in the cart (any route change
  // or F-key navigation), save them as a held sale.
  useEffect(() => {
    return () => {
      const c = cartRef.current;
      if (c.lines.length === 0) return;
      void api
        .holdSale({ id: crypto.randomUUID(), lines: saleLines(c) })
        .then(() => toast.success('Nota ditahan otomatis'))
        .catch(() => undefined);
    };
  }, []);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const loadHeld = useCallback(() => {
    api
      .listHeldSales()
      .then((r) => setHeldSales(r.heldSales))
      .catch((err: unknown) => toast.error(errorMessage(err)));
  }, []);

  useEffect(() => {
    api
      .settings()
      .then((r) => setSettings(r.settings))
      .catch((err: unknown) => toast.error(errorMessage(err)));
    api
      .listHeldSales()
      .then((r) => {
        setHeldSales(r.heldSales);
        if (r.heldSales.length > 0) setDialog('held');
      })
      .catch((err: unknown) => toast.error(errorMessage(err)));
    focusSearch();
  }, [focusSearch]);

  const totals = cartTotals(cart, settings?.rounding ?? 'none');
  const isEmpty = cart.lines.length === 0;
  const busy = dialog !== null || weighing !== null || completed !== null || paidKasbon !== null;

  function resetCart() {
    dispatch({ type: 'clear' });
    setSaleId(crypto.randomUUID());
  }

  function addProduct(product: Product) {
    if (product.type === 'bulk') {
      setWeighing(product);
      return;
    }
    dispatch({ type: 'add', product });
    focusSearch();
  }

  /** Reloads every product in the cart (prices, stock); drops deactivated ones. */
  async function refreshCart() {
    const ids = [...new Set(cart.lines.map((l) => l.product.id))];
    const products = new Map<string, Product>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          products.set(id, (await api.getProduct(id)).product);
        } catch {
          // Missing products are dropped from the cart below.
        }
      }),
    );
    const dropped = cart.lines.filter((l) => !products.get(l.product.id)?.active);
    dispatch({ type: 'replaceProducts', products });
    if (dropped.length > 0) {
      toast.warning(`Dihapus dari keranjang: ${dropped.map((l) => l.product.name).join(', ')}`);
    }
  }

  async function hold() {
    if (isEmpty || busy) return;
    try {
      await api.holdSale({ id: crypto.randomUUID(), lines: saleLines(cart) });
      resetCart();
      loadHeld();
      toast.success('Transaksi ditahan.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
    focusSearch();
  }

  async function resume(sale: Sale) {
    try {
      const { lines, removed } = await api.resumeHeldSale(sale.id);
      dispatch({
        type: 'load',
        lines: lines.map((l) => ({
          product: l.product,
          unitId: l.unitId,
          qtyBase: l.qtyBase,
          heldUnitPrice: l.heldUnitPrice,
          ...(l.note ? { note: l.note } : {}),
        })),
      });
      setSaleId(crypto.randomUUID());
      setDialog(null);
      loadHeld();
      if (removed.length > 0) {
        toast.warning(`Barang nonaktif dihapus: ${removed.join(', ')}`);
      }
      const changed = lines.filter((l) => {
        const unit = l.product.units.find((u) => u.id === l.unitId);
        return unit && unit.sellPrice !== l.heldUnitPrice;
      });
      if (changed.length > 0) {
        toast.warning(
          `Harga berubah sejak ditahan: ${changed.map((l) => l.product.name).join(', ')}`,
        );
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function deleteHeld(task: () => Promise<{ deleted: number }>) {
    try {
      const { deleted } = await task();
      toast.success(`${deleted} transaksi ditahan dihapus.`);
      loadHeld();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  useShortcutHandlers({
    pay: () => {
      if (!isEmpty && !busy) setDialog('pay');
    },
    hold: () => void hold(),
  });

  // Esc with no dialog open: cancel the sale (with confirmation).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (cart.lines.length > 0) setDialog('cancel');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cart.lines.length]);

  const earlierHeld = heldSales.filter((s) => isFromEarlierDay(s, new Date())).length;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center gap-6 px-6">
        <BrandMark compact />
        {settings && settings.storeName !== 'TOKO PODOMORO' && (
          <span className="text-lg font-semibold">{settings.storeName}</span>
        )}
        <span className="ml-auto text-muted-foreground">{today()}</span>
        <span className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="leading-tight">
            <span className="block font-semibold">{user.name}</span>
            <span className="block text-sm text-muted-foreground">{roleLabels[user.role]}</span>
          </span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Kunci layar (Ctrl+L)"
              data-testid="lock"
              onClick={() => void lock()}
            >
              <Lock className="size-5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Kunci layar (Ctrl+L)</TooltipContent>
        </Tooltip>
      </header>

      <main className="flex min-h-0 flex-1 gap-5 px-6 pb-3">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <ProductSearch inputRef={searchRef} onPick={addProduct} />
          <Card className="min-h-0 flex-1 p-3">
            <CartTable cart={cart} dispatch={dispatch} onDone={focusSearch} />
          </Card>
        </section>

        <aside className="flex w-[384px] shrink-0 flex-col gap-4">
          <Card className="space-y-3 p-6">
            <div className="flex justify-between text-[17px]">
              <span className="text-muted-foreground">Total Item:</span>
              <span className="tabular-nums" data-testid="item-count">
                {cart.lines.length}
              </span>
            </div>
            <div className="flex justify-between text-[17px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums" data-testid="subtotal">
                {formatRupiah(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-[17px]">
              <span className="text-muted-foreground">Pembulatan</span>
              <span className="tabular-nums">{formatRupiah(totals.roundingAmount)}</span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="label-caps">Total</div>
              <div
                className="text-right text-[52px] leading-tight font-bold tracking-[-0.03em] tabular-nums"
                data-testid="total"
              >
                {formatRupiah(totals.total)}
              </div>
            </div>
          </Card>

          <Button
            className="h-[72px] justify-between rounded-[20px] px-6 text-2xl"
            disabled={isEmpty}
            onClick={() => setDialog('pay')}
          >
            Bayar
            <Kbd className="h-7 px-2 text-sm">F8</Kbd>
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" disabled={isEmpty} onClick={() => void hold()}>
              Tahan <Kbd>F9</Kbd>
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={isEmpty}
              onClick={() => setDialog('cancel')}
              className="hover:bg-destructive-soft hover:text-destructive"
            >
              Batal <Kbd>Esc</Kbd>
            </Button>
          </div>

          {heldSales.length > 0 && (
            <button
              type="button"
              onClick={() => setDialog('held')}
              data-testid="held-notice"
              className="flex items-center gap-3 rounded-[20px] border border-warning-border bg-warning-soft px-5 py-4 text-left text-warning-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft"
            >
              <PauseCircle className="size-6 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">{heldSales.length} transaksi ditahan</span>
                <span className="block text-sm">
                  {earlierHeld > 0 ? `${earlierHeld} dari kemarin · ` : ''}Klik untuk melihat
                </span>
              </span>
            </button>
          )}
        </aside>
      </main>

      <footer className="flex h-11 shrink-0 items-center gap-1 border-t border-border px-6">
        {FOOTER_KEYS.map(({ key, label, path }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (path) navigate(path);
              else if (key === 'F2') focusSearch();
              else if (key === 'F8' && !isEmpty) setDialog('pay');
              else if (key === 'F9') void hold();
              else if (key === 'Esc' && !isEmpty) setDialog('cancel');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Kbd>{key}</Kbd>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDialog('kasbon-payment')}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold text-warning-foreground hover:bg-warning-soft"
        >
          Bayar kasbon
        </button>
      </footer>

      <WeightDialog
        product={weighing}
        onAdd={(product, qtyBase) => {
          dispatch({ type: 'add', product, qtyBase });
          setWeighing(null);
        }}
        onClose={() => setWeighing(null)}
        onClosed={focusSearch}
      />
      <PayDialog
        open={dialog === 'pay'}
        saleId={saleId}
        total={totals.total}
        lines={saleLines(cart)}
        onClose={() => setDialog(null)}
        onTotalChanged={() => void refreshCart()}
        onPaid={({ sale, warnings }) => {
          setDialog(null);
          resetCart();
          setCompleted(sale);
          for (const w of warnings) {
            toast.warning(`Stok ${w.productName} sekarang minus (${w.stock} ${w.baseUnit}).`);
          }
        }}
        onClosed={focusSearch}
      />
      <ReceiptPromptDialog
        doc={
          completed?.number ? { kind: 'sale', id: completed.id, number: completed.number } : null
        }
        title="Transaksi selesai"
        summary={
          completed &&
          (completed.debtAmount > 0 ? (
            <div className="space-y-2">
              <AmountBlock
                label="Kasbon"
                amount={formatRupiah(completed.debtAmount)}
                tone="kasbon"
                testId="sale-kasbon"
              />
              <p className="text-muted-foreground">
                Sisa kasbon {completed.customerName}:{' '}
                <span className="font-semibold text-warning-foreground tabular-nums">
                  {formatRupiah(completed.customerBalanceAfter ?? 0)}
                </span>
              </p>
            </div>
          ) : (
            <AmountBlock
              label="Kembalian"
              amount={formatRupiah(completed.changeAmount)}
              tone="change"
              testId="change-amount"
            />
          ))
        }
        onClose={() => setCompleted(null)}
        onClosed={focusSearch}
      />
      <CustomerPaymentDialog
        open={dialog === 'kasbon-payment'}
        onClose={() => setDialog(null)}
        onPaid={(payment) => {
          setDialog(null);
          setPaidKasbon(payment);
        }}
        onClosed={focusSearch}
      />
      <ReceiptPromptDialog
        doc={paidKasbon ? { kind: 'payment', id: paidKasbon.id, number: paidKasbon.number } : null}
        title="Kasbon dibayar"
        summary={paidKasbon && <PaymentSummary payment={paidKasbon} />}
        onClose={() => setPaidKasbon(null)}
        onClosed={focusSearch}
      />
      <HeldSalesDialog
        open={dialog === 'held'}
        heldSales={heldSales}
        cartEmpty={isEmpty}
        onResume={(sale) => void resume(sale)}
        onDelete={(sale) => void deleteHeld(() => api.deleteHeldSale(sale.id))}
        onDeleteEarlier={() =>
          void deleteHeld(() => api.deleteHeldSalesBefore(localDate(new Date())))
        }
        onClose={() => setDialog(null)}
        onClosed={focusSearch}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Batalkan transaksi?"
        description="Semua barang di keranjang akan dihapus."
        confirmLabel="Ya, batalkan"
        destructive
        onConfirm={() => {
          resetCart();
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
        onClosed={focusSearch}
      />
    </div>
  );
}
