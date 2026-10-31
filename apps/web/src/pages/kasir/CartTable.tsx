import { formatInteger, formatRupiah } from '@toko-podomoro/shared';
import { RotateCcw, ShoppingBasket, X } from 'lucide-react';
import { type Dispatch, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { formatQty } from '../../lib/format';
import { cn } from '../../lib/utils';
import { type Cart, type CartAction, cartQtyOf, lineSubtotalOf, lineUnit } from './cart';

const GRID = 'grid grid-cols-[44px_minmax(0,1fr)_240px_140px_140px_40px] items-center gap-3';

/** Cart lines: no, name with code · category, qty + unit, price, subtotal, remove. */
export function CartTable({
  cart,
  dispatch,
  onDone,
  onEditLine,
}: {
  cart: Cart;
  dispatch: Dispatch<CartAction>;
  /** Called after an edit is finished (Enter); Kasir returns focus to the search box. */
  onDone: () => void;
  /** Reopens the add modal in edit mode for a cart line. */
  onEditLine: (key: string) => void;
}) {
  const newestRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view as the cart grows.
  const newestKey = cart.newestKey;
  useEffect(() => {
    if (newestKey) newestRef.current?.scrollIntoView({ block: 'nearest' });
  }, [newestKey]);

  const finishOnEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onDone();
    }
  };

  if (cart.lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShoppingBasket className="size-12 text-faint" aria-hidden />
        <p className="text-lg">Keranjang kosong. Scan atau cari barang untuk mulai.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn(GRID, 'px-3 pb-2')}>
        <span className="label-caps text-center">No</span>
        <span className="label-caps">Barang</span>
        <span className="label-caps">Jumlah</span>
        <span className="label-caps text-right">Harga</span>
        <span className="label-caps text-right">Subtotal</span>
        <span className="sr-only">Hapus</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" data-testid="cart">
        {cart.lines.map((line, index) => {
          const unit = lineUnit(line);
          const isBulk = line.product.type === 'bulk';
          const isNewest = line.key === cart.newestKey;
          const remaining = line.product.stock - cartQtyOf(cart, line.product.id);
          const priceChanged =
            line.heldUnitPrice !== undefined && unit && line.heldUnitPrice !== unit.sellPrice;
          const isReturn = line.qtyBase < 0;
          return (
            <div
              key={line.key}
              ref={isNewest ? newestRef : undefined}
              data-line={line.product.code}
              className={cn(
                GRID,
                'rounded-row px-3 py-2.5 text-[17px]',
                isNewest ? 'bg-selected' : 'hover:bg-muted',
              )}
            >
              <span className="text-center text-muted-foreground tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <button
                  type="button"
                  data-edit-line={line.product.code}
                  onClick={() => onEditLine(line.key)}
                  className="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft rounded"
                >
                  <span className="truncate font-semibold uppercase">
                    {line.product.name}
                    {line.note && (
                      <span className="font-normal text-muted-foreground"> ({line.note})</span>
                    )}
                  </span>
                  {isNewest && <Badge variant="primary">BARU</Badge>}
                  {isReturn && <Badge variant="destructive">RETUR</Badge>}
                  {priceChanged && <Badge variant="warning">Harga berubah</Badge>}
                </button>
                <div className="truncate text-sm text-muted-foreground">
                  <span className="font-mono">{line.product.code}</span> ·{' '}
                  {line.product.categoryName}
                </div>
                {remaining < 0 && (
                  <div className="text-sm font-semibold text-destructive">
                    Stok kurang: sisa{' '}
                    {formatQty(line.product.stock, line.product.baseUnit, line.product.unitChain)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <QtyInput
                  label={`Jumlah ${line.product.name}`}
                  code={line.product.code}
                  value={unit ? (isBulk ? line.qtyBase : line.qtyBase / unit.factor) : 1}
                  onCommit={(value) => {
                    if (!unit) return;
                    dispatch({
                      type: 'setQty',
                      key: line.key,
                      qtyBase: isBulk ? value : value * unit.factor,
                    });
                  }}
                  onKeyDown={finishOnEnter}
                  suffix={isBulk ? line.product.baseUnit : undefined}
                  className={isBulk ? 'w-36' : 'w-20'}
                />
                <button
                  type="button"
                  aria-pressed={isReturn}
                  aria-label={`${isReturn ? 'Batalkan retur' : 'Tandai retur'} ${line.product.name}`}
                  data-return-toggle={line.product.code}
                  title={isReturn ? 'Batalkan retur' : 'Tandai sebagai retur'}
                  onClick={() => {
                    dispatch({ type: 'setQty', key: line.key, qtyBase: -line.qtyBase });
                    onDone();
                  }}
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-control transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft',
                    isReturn
                      ? 'bg-destructive-soft text-destructive hover:bg-destructive-soft/80'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </button>
                {!isBulk && line.product.units.length > 1 ? (
                  <Select
                    value={line.unitId}
                    onValueChange={(unitId) => dispatch({ type: 'setUnit', key: line.key, unitId })}
                  >
                    <SelectTrigger aria-label={`Satuan ${line.product.name}`} className="h-12 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {line.product.units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground">{isBulk ? '' : unit?.name}</span>
                )}
              </div>
              <div className="text-right tabular-nums">
                <div className="font-semibold">
                  {formatRupiah(line.unitPrice ?? unit?.sellPrice ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">/ {unit?.name}</div>
              </div>
              <div className="text-right font-semibold tabular-nums">
                {formatRupiah(lineSubtotalOf(line))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Hapus ${line.product.name}`}
                onClick={() => {
                  dispatch({ type: 'remove', key: line.key });
                  onDone();
                }}
                className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Quantity field that may be empty while typing; values of 1 or more apply at once, and an
 * empty field falls back to the current quantity when it loses focus.
 */
function QtyInput({
  label,
  code,
  value,
  onCommit,
  onKeyDown,
  suffix,
  className,
}: {
  label: string;
  code: string;
  value: number;
  onCommit: (value: number) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  suffix?: string | undefined;
  className: string;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  function parse(raw: string): number | null {
    const cleaned = raw.replace(/\./g, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '+') return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  }
  return (
    <div className="relative">
      <Input
        aria-label={label}
        data-qty-input={code}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft === undefined ? formatInteger(value) : draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = parse(raw);
          if (n !== null && n !== 0) onCommit(n);
        }}
        onBlur={() => {
          if (draft !== undefined) {
            const n = parse(draft);
            if (n !== null && n !== 0) onCommit(n);
          }
          setDraft(undefined);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={onKeyDown}
        className={cn('text-right tabular-nums', className)}
        style={suffix ? { paddingRight: `calc(1.5rem + ${suffix.length}ch)` } : undefined}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
