import { formatRupiah, localDate, type Sale } from '@toko-podomoro/shared';
import { Play, Printer, Trash2 } from 'lucide-react';
import { api } from '../../api/endpoints';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** True for held sales from an earlier local day ("kemarin"). */
export function isFromEarlierDay(sale: Sale, now: Date): boolean {
  return localDate(new Date(sale.createdAt)) < localDate(now);
}

/** Transaksi ditahan: resume (only into an empty cart), delete one, or delete all "kemarin". */
export function HeldSalesDialog({
  open,
  heldSales,
  cartEmpty,
  onResume,
  onDelete,
  onDeleteEarlier,
  onClose,
  onClosed,
}: {
  open: boolean;
  heldSales: Sale[];
  cartEmpty: boolean;
  onResume: (sale: Sale) => void;
  onDelete: (sale: Sale) => void;
  onDeleteEarlier: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const now = new Date();
  const earlier = heldSales.filter((s) => isFromEarlierDay(s, now)).length;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>Transaksi ditahan</DialogTitle>
          <DialogDescription>
            {cartEmpty
              ? 'Pilih transaksi untuk dilanjutkan. Harga diperbarui ke harga saat ini.'
              : 'Selesaikan, tahan, atau batalkan keranjang saat ini sebelum melanjutkan transaksi lain.'}
          </DialogDescription>
        </DialogHeader>
        {heldSales.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Tidak ada transaksi ditahan.</p>
        ) : (
          <ul className="max-h-[52vh] space-y-1 overflow-y-auto">
            {heldSales.map((sale, index) => (
              <li
                key={sale.id}
                data-held={sale.id}
                className="flex items-center gap-4 rounded-row px-3 py-2.5 hover:bg-muted"
              >
                <div className="w-24 shrink-0 tabular-nums">
                  <div className="font-semibold">{time(sale.createdAt)}</div>
                  {isFromEarlierDay(sale, now) && <Badge variant="warning">kemarin</Badge>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {sale.number ?? 'DRAFT'} · {sale.customerName ?? 'UMUM'}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {sale.items.map((i) => i.productName).join(', ')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {sale.itemCount} barang · {sale.cashierName}
                  </div>
                </div>
                <div className="w-32 shrink-0 text-right font-semibold tabular-nums">
                  {formatRupiah(sale.total)}
                </div>
                <Button
                  size="sm"
                  onClick={() => onResume(sale)}
                  disabled={!cartEmpty}
                  data-autofocus={index === 0 && cartEmpty ? true : undefined}
                >
                  <Play className="size-4" aria-hidden />
                  Lanjutkan
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Cetak draft ${time(sale.createdAt)}`}
                  onClick={() => window.open(api.heldDraftUrl(sale.id), '_blank')}
                >
                  <Printer className="size-[18px]" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus transaksi ditahan ${time(sale.createdAt)}`}
                  onClick={() => onDelete(sale)}
                  className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                >
                  <Trash2 className="size-[18px]" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between gap-3">
          {earlier > 0 ? (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive-soft"
              onClick={onDeleteEarlier}
            >
              <Trash2 className="size-4" aria-hidden />
              Hapus semua kemarin ({earlier})
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
