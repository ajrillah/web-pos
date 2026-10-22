import { formatRupiah, lineSubtotal, type Product } from '@toko-podomoro/shared';
import { type FormEvent, useEffect, useState } from 'react';
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
import { primaryUnit } from './cart';

/** Weight entry for bulk items: integer grams (or ml), priced per kg (or liter). */
export function WeightDialog({
  product,
  onAdd,
  onClose,
  onClosed,
}: {
  product: Product | null;
  onAdd: (product: Product, qtyBase: number) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [qty, setQty] = useState<number | null>(null);
  useEffect(() => {
    if (product) setQty(null);
  }, [product]);

  const unit = product ? primaryUnit(product) : undefined;
  const price =
    unit && qty
      ? lineSubtotal({ qtyBase: qty, unitPrice: unit.sellPrice, unitFactor: unit.factor })
      : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (product && qty && qty > 0) onAdd(product, qty);
  }

  return (
    <Dialog open={product !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>
            {unit && `${formatRupiah(unit.sellPrice)} / ${unit.name}. `}Masukkan berat dalam{' '}
            {product?.baseUnit}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="weight">Berat</Label>
            <NumberInput
              id="weight"
              value={qty}
              onValueChange={setQty}
              suffix={product?.baseUnit ?? ''}
              autoFocus
              className="[&_input]:h-14 [&_input]:text-2xl"
            />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="label-caps">Harga</span>
            <span className="text-2xl font-bold tabular-nums">{formatRupiah(price)}</span>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Batal <Kbd>Esc</Kbd>
            </Button>
            <Button type="submit" disabled={!qty}>
              Tambah <Kbd>Enter</Kbd>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
