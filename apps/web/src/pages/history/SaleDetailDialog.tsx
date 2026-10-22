import {
  formatInteger,
  formatRupiah,
  formatUnitQty,
  type ReceiptSavedResponse,
  type Sale,
} from '@toko-podomoro/shared';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api, receipts } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { ReceiptActions } from '../../components/receipts/ReceiptActions';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Transaction detail: items, totals, payments, and receipt actions (save a copy, open, download). */
export function SaleDetailDialog({
  saleId,
  onClose,
}: {
  saleId: string | null;
  onClose: () => void;
}) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSale(null);
    setError(null);
    if (saleId) {
      api
        .getSale(saleId)
        .then((r) => setSale(r.sale))
        .catch((err: unknown) => setError(errorMessage(err)));
    }
  }, [saleId]);

  async function save() {
    if (!sale) return;
    try {
      const saved: ReceiptSavedResponse = await receipts.save('sale', sale.id);
      toast.success(`Nota disimpan: ${saved.fileName}`);
      setSale((await api.getSale(sale.id)).sale);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open={saleId !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{sale?.number ?? 'Transaksi'}</span>
            {sale?.status === 'voided' && <Badge variant="destructive">Dibatalkan</Badge>}
          </DialogTitle>
          <DialogDescription>
            {sale?.completedAt && `${dateTime(sale.completedAt)} · Kasir ${sale.cashierName}`}
          </DialogDescription>
        </DialogHeader>
        <ErrorAlert message={error} />
        {sale && (
          <div className="space-y-4">
            <ul className="max-h-[38vh] space-y-1 overflow-y-auto">
              {sale.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 rounded-row px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{item.productName}</div>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {formatUnitQty(item.qtyBase, item.unitFactor)} {item.unitName} ×{' '}
                      {formatInteger(item.unitPrice)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{formatRupiah(item.subtotal)}</div>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-border px-3 pt-3 tabular-nums">
              <Row label="Subtotal" value={formatRupiah(sale.subtotal)} />
              {sale.roundingAmount !== 0 && (
                <Row label="Pembulatan" value={formatRupiah(sale.roundingAmount)} />
              )}
              <Row label="Total" value={formatRupiah(sale.total)} strong />
              {sale.payments.map((p) => (
                <Row
                  key={p.method}
                  label={p.method === 'cash' ? 'Tunai' : 'QRIS'}
                  value={formatRupiah(p.amount)}
                />
              ))}
              {sale.debtAmount > 0 ? (
                <>
                  <Row
                    label={`Kasbon · ${sale.customerName}`}
                    value={formatRupiah(sale.debtAmount)}
                  />
                  <Row
                    label="Sisa kasbon setelah transaksi"
                    value={formatRupiah(sale.customerBalanceAfter ?? 0)}
                  />
                </>
              ) : (
                <Row label="Kembalian" value={formatRupiah(sale.changeAmount)} />
              )}
            </dl>
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <Button onClick={() => void save()}>
                  <Save className="size-[18px]" aria-hidden />
                  {sale.receiptCount > 0 ? 'Simpan salinan nota' : 'Simpan nota'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {sale.receiptCount > 0
                    ? `Nota sudah dibuat ${sale.receiptCount}×; berikutnya ditandai SALINAN.`
                    : 'Nota belum pernah dibuat.'}
                </span>
              </div>
              <ReceiptActions kind="sale" id={sale.id} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between text-lg font-bold' : 'flex justify-between'}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
