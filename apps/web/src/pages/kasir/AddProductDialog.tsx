import {
  formatRupiah,
  lineSubtotal,
  NOTE_MAX_LENGTH,
  type Product,
  type ProductUnit,
} from '@toko-podomoro/shared';
import { Check } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { Input } from '../../components/ui/input';
import { Kbd } from '../../components/ui/kbd';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
import { primaryUnit } from './cart';

/** Fields collected per cart line; `qtyBase` is in the product's stock unit, always positive. */
export interface AddProductResult {
  unitId: string;
  qtyBase: number;
  /** Set when the cashier overrode the default sell price. */
  unitPrice?: number;
  note?: string;
}

export interface AddProductInitial {
  unitId: string;
  qtyBase: number;
  unitPrice?: number;
  note?: string;
}

type Step = 'qty' | 'unit' | 'price' | 'note';

/**
 * Sequential modal for adding or editing a cart line: qty → unit → price → note.
 * Each Enter goes to the next step; Esc cancels. The unit step is skipped for products with a
 * single unit (that includes every bulk product).
 */
export function AddProductDialog({
  product,
  initial,
  onDone,
  onCancel,
  onClosed,
}: {
  product: Product | null;
  /** Set to pre-fill the fields (edit mode). */
  initial?: AddProductInitial | undefined;
  onDone: (result: AddProductResult) => void;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const isBulk = product?.type === 'bulk';
  const singleUnit = (product?.units.length ?? 0) <= 1;
  const skipUnit = singleUnit || isBulk;

  const [step, setStep] = useState<Step>('qty');
  const [qty, setQty] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<string>('');
  const [unitHighlight, setUnitHighlight] = useState(0);
  const [price, setPrice] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unitListRef = useRef<HTMLDivElement>(null);

  // Reset state whenever a new product (or edit target) opens the dialog.
  useEffect(() => {
    if (!product) return;
    const unit = initial
      ? (product.units.find((u) => u.id === initial.unitId) ?? primaryUnit(product))
      : primaryUnit(product);
    const nextUnitId = unit?.id ?? '';
    setStep('qty');
    setError(null);
    setUnitId(nextUnitId);
    setUnitHighlight(product.units.findIndex((u) => u.id === nextUnitId));
    setNote(initial?.note ?? '');
    if (initial) {
      setQty(isBulk ? initial.qtyBase : unit ? initial.qtyBase / unit.factor : 1);
      setPrice(initial.unitPrice ?? unit?.sellPrice ?? null);
    } else {
      setQty(isBulk ? null : 1);
      setPrice(unit?.sellPrice ?? null);
    }
  }, [product, initial, isBulk]);

  const unit = useMemo(() => product?.units.find((u) => u.id === unitId), [product, unitId]);

  // When moving between steps the price default follows the current unit, unless the cashier
  // already entered one that differs from the previous unit's default.
  function advanceFromUnit(nextUnit: ProductUnit) {
    setUnitId(nextUnit.id);
    setPrice((current) =>
      current === null || current === unit?.sellPrice ? nextUnit.sellPrice : current,
    );
    setStep('price');
  }

  function next() {
    setError(null);
    if (step === 'qty') {
      if (!qty || qty <= 0) {
        setError(isBulk ? 'Masukkan berat.' : 'Masukkan jumlah.');
        return;
      }
      setStep(skipUnit ? 'price' : 'unit');
      return;
    }
    if (step === 'unit') {
      const chosen = product?.units[unitHighlight];
      if (!chosen) return;
      advanceFromUnit(chosen);
      return;
    }
    if (step === 'price') {
      if (price === null || price <= 0) {
        setError('Harga tidak boleh 0.');
        return;
      }
      if (unit && price < unit.costPrice) {
        setError(`Harga tidak boleh di bawah modal (${formatRupiah(unit.costPrice)}).`);
        return;
      }
      setStep('note');
      return;
    }
    if (step === 'note') submit();
  }

  function submit() {
    if (!product || !unit || !qty || qty <= 0 || price === null) return;
    if (price < unit.costPrice) {
      setError(`Harga tidak boleh di bawah modal (${formatRupiah(unit.costPrice)}).`);
      return;
    }
    const qtyBase = isBulk ? qty : qty * unit.factor;
    const defaultPrice = unit.sellPrice;
    const trimmed = note.trim();
    onDone({
      unitId: unit.id,
      qtyBase,
      ...(price !== defaultPrice ? { unitPrice: price } : {}),
      ...(trimmed ? { note: trimmed } : {}),
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  }

  const open = product !== null;
  const title = initial ? 'Edit barang' : product?.name;
  const previewQty = qty && unit ? (isBulk ? qty : qty * unit.factor) : 0;
  const previewSubtotal =
    unit && price && previewQty
      ? lineSubtotal({ qtyBase: previewQty, unitPrice: price, unitFactor: unit.factor })
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="max-w-lg"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {product && (
              <>
                <span className="font-mono">{product.code}</span> · {product.categoryName}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} skipUnit={skipUnit} />

        {step === 'qty' && (
          <div className="space-y-2">
            <Label htmlFor="add-qty">{isBulk ? `Berat (${product?.baseUnit})` : 'Jumlah'}</Label>
            <NumberInput
              id="add-qty"
              value={qty}
              onValueChange={setQty}
              onKeyDown={onKey}
              suffix={isBulk ? (product?.baseUnit ?? '') : (unit?.name ?? '')}
              autoFocus
              className="[&_input]:h-14 [&_input]:text-2xl"
            />
            {!isBulk && unit && (
              <p className="text-sm text-muted-foreground">
                {formatRupiah(unit.sellPrice)} / {unit.name}
              </p>
            )}
          </div>
        )}

        {step === 'unit' && product && (
          <div className="space-y-2">
            <Label>Satuan</Label>
            <div
              ref={unitListRef}
              role="listbox"
              aria-label="Pilih satuan"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setUnitHighlight((h) => Math.min(h + 1, product.units.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setUnitHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  next();
                }
              }}
              // biome-ignore lint/a11y/noAutofocus: step opens inside the dialog to be navigated.
              autoFocus
              className="max-h-72 space-y-1 overflow-y-auto rounded-control border border-input bg-card p-1.5 outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
            >
              {product.units.map((u, index) => (
                <div
                  key={u.id}
                  id={`add-unit-${index}`}
                  role="option"
                  aria-selected={index === unitHighlight}
                  tabIndex={-1}
                  data-unit={u.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setUnitHighlight(index);
                    advanceFromUnit(u);
                  }}
                  onMouseEnter={() => setUnitHighlight(index)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-4 rounded-row px-4 py-2.5 text-[17px]',
                    index === unitHighlight && 'bg-selected',
                  )}
                >
                  <span className="font-semibold">{u.name}</span>
                  <span className="tabular-nums">
                    {formatRupiah(u.sellPrice)} / {u.name}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Pilih dengan panah atas/bawah, tekan Enter.
            </p>
          </div>
        )}

        {step === 'price' && unit && (
          <div className="space-y-2">
            <Label htmlFor="add-price">Harga per {unit.name}</Label>
            <NumberInput
              id="add-price"
              value={price}
              onValueChange={setPrice}
              onKeyDown={onKey}
              prefix="Rp"
              autoFocus
              className="[&_input]:h-14 [&_input]:text-2xl"
            />
            <p className="text-sm text-muted-foreground">
              Harga asli {formatRupiah(unit.sellPrice)}. Modal {formatRupiah(unit.costPrice)}.
            </p>
          </div>
        )}

        {step === 'note' && (
          <div className="space-y-2">
            <Label htmlFor="add-note">Catatan (opsional)</Label>
            <Input
              id="add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKey}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Mis. ACEH, hadiah, dll."
              autoComplete="off"
              autoFocus
              className="uppercase-input"
            />
            <p className="text-sm text-muted-foreground">
              Kosongkan dan tekan Enter untuk melewati.
            </p>
          </div>
        )}

        {previewSubtotal > 0 && (
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="label-caps">Subtotal</span>
            <span className="text-2xl font-bold tabular-nums">{formatRupiah(previewSubtotal)}</span>
          </div>
        )}

        <ErrorAlert message={error} />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Batal <Kbd>Esc</Kbd>
          </Button>
          <Button onClick={next} className="min-w-40">
            {step === 'note' ? (
              <>
                <Check className="size-4" aria-hidden />
                {initial ? 'Simpan' : 'Tambah'} <Kbd>Enter</Kbd>
              </>
            ) : (
              <>
                Lanjut <Kbd>Enter</Kbd>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step, skipUnit }: { step: Step; skipUnit: boolean }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'qty', label: 'Jumlah' },
    ...(skipUnit ? [] : [{ key: 'unit' as const, label: 'Satuan' }]),
    { key: 'price', label: 'Harga' },
    { key: 'note', label: 'Catatan' },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-semibold tabular-nums',
              i < activeIndex && 'bg-primary-soft text-primary',
              i === activeIndex && 'bg-primary text-primary-foreground',
              i > activeIndex && 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span
            className={cn(
              i === activeIndex ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-faint">·</span>}
        </span>
      ))}
    </div>
  );
}
