import {
  type CostReviewItem,
  formatInteger,
  formatRupiah,
  formatUnitQty,
  type Purchase,
} from '@toko-podomoro/shared';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useApproval } from '../../approval/ApprovalProvider';
import { ErrorAlert } from '../../components/forms';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { VoidDialog } from '../../components/VoidDialog';
import { dayLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';
import { SUPPLIER_VOID_REASONS } from '../suppliers/SupplierPaymentDetailDialog';

/** The unit cost prices refer to: the stock unit, or kg / liter for bulk products. */
export function pricingUnit(pricingFactor: number, baseUnit: string): string {
  return pricingFactor === 1000 ? (baseUnit === 'ml' ? 'liter' : 'kg') : baseUnit;
}

/** Cost per pricing unit with its unit, e.g. `Rp 2.500 / pcs` or `Rp 14.000 / kg`. */
export function costLabel(cost: number, pricingFactor: number, baseUnit: string): string {
  return `${formatRupiah(cost)} / ${pricingUnit(pricingFactor, baseUnit)}`;
}

/** A purchase: lines, payments, debt; void with owner PIN (then a cost price review). */
export function PurchaseDetailDialog({
  purchaseId,
  onClose,
  onChanged,
}: {
  purchaseId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [review, setReview] = useState<CostReviewItem[] | null>(null);
  const { withApproval } = useApproval();

  useEffect(() => {
    setPurchase(null);
    setError(null);
    if (purchaseId) {
      api
        .getPurchase(purchaseId)
        .then((r) => setPurchase(r.purchase))
        .catch((err: unknown) => setError(errorMessage(err)));
    }
  }, [purchaseId]);

  return (
    <>
      <Dialog open={purchaseId !== null} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{purchase?.number ?? 'Stok masuk'}</span>
              {purchase?.status === 'voided' && <Badge variant="destructive">Dibatalkan</Badge>}
            </DialogTitle>
            <DialogDescription>
              {purchase &&
                `${purchase.supplierName} · tanggal ${dayLabel(purchase.date)} · dicatat ${dateTime(purchase.createdAt)} oleh ${purchase.userName}`}
            </DialogDescription>
          </DialogHeader>
          <ErrorAlert message={error} />
          {purchase && (
            <div className="space-y-4">
              {purchase.note && <p className="text-muted-foreground">Catatan: {purchase.note}</p>}
              <div className="max-h-[36vh] overflow-y-auto">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="label-caps text-left">
                      <th className="px-3 py-2 font-semibold">Barang</th>
                      <th className="px-3 py-2 text-right font-semibold">Jumlah</th>
                      <th className="px-3 py-2 text-right font-semibold">Harga beli</th>
                      <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                      <th className="px-3 py-2 text-right font-semibold">Modal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item) => (
                      <tr key={item.id} data-item={item.productCode}>
                        <td className="px-3 py-2">
                          <span className="block font-semibold">{item.productName}</span>
                          <span className="block font-mono text-sm text-muted-foreground">
                            {item.productCode}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatUnitQty(item.qtyBase, item.unitFactor)} {item.unitName}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatRupiah(item.buyPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {formatRupiah(item.subtotal)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums">
                          {item.newCostPrice === item.oldCostPrice ? (
                            <span className="text-muted-foreground">
                              {formatInteger(item.newCostPrice)}
                            </span>
                          ) : (
                            <span>
                              <span className="text-muted-foreground line-through">
                                {formatInteger(item.oldCostPrice)}
                              </span>{' '}
                              {formatInteger(item.newCostPrice)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="space-y-1.5 border-t border-border px-3 pt-3 tabular-nums">
                <div className="flex justify-between text-lg font-bold">
                  <dt>Total</dt>
                  <dd>{formatRupiah(purchase.total)}</dd>
                </div>
                {purchase.payments.map((p) => (
                  <div
                    key={p.paymentId}
                    className={cn(
                      'flex justify-between',
                      p.status === 'voided' && 'text-muted-foreground line-through',
                    )}
                  >
                    <dt className="text-muted-foreground">
                      <span className="font-mono">{p.number}</span> ·{' '}
                      {p.initial ? 'dibayar saat dicatat' : 'bayar hutang'} ·{' '}
                      {p.method === 'cash' ? 'Tunai' : 'QRIS'}
                    </dt>
                    <dd>{formatRupiah(p.amount)}</dd>
                  </div>
                ))}
                {purchase.status === 'completed' && (
                  <div className="flex justify-between font-semibold">
                    <dt>Sisa hutang</dt>
                    <dd
                      className={
                        purchase.remaining > 0 ? 'text-warning-foreground' : 'text-success'
                      }
                    >
                      {purchase.remaining > 0 ? formatRupiah(purchase.remaining) : 'Lunas'}
                    </dd>
                  </div>
                )}
                {purchase.voidReason && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Alasan batal</dt>
                    <dd>{purchase.voidReason}</dd>
                  </div>
                )}
              </dl>
              {purchase.status === 'completed' && (
                <div className="flex justify-end border-t border-border pt-4">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive-soft"
                    onClick={() => setVoiding(true)}
                  >
                    <Ban className="size-[18px]" aria-hidden />
                    Batalkan stok masuk
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
        {purchase && (
          <VoidDialog
            open={voiding}
            title={`Batalkan ${purchase.number}?`}
            description="Stok barang dikurangi kembali dan pembayaran awalnya ikut dibatalkan. Harga modal tidak dikembalikan."
            reasons={SUPPLIER_VOID_REASONS}
            onClose={() => setVoiding(false)}
            onVoid={async (input) => {
              const result = await withApproval('purchase.void', purchase.id, (token) =>
                api.voidPurchase(purchase.id, input, token),
              );
              setPurchase(result.purchase);
              setVoiding(false);
              toast.success(`${result.purchase.number} dibatalkan.`);
              if (result.costReview.length > 0) setReview(result.costReview);
              onChanged?.();
            }}
          />
        )}
      </Dialog>

      <Dialog open={review !== null} onOpenChange={(next) => !next && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Periksa harga modal</DialogTitle>
            <DialogDescription>
              Stok masuk ini mengubah harga modal barang berikut. Harga modal tidak dikembalikan
              otomatis; periksa dan ubah bila perlu.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1">
            {review?.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-4 rounded-row px-3 py-2"
                data-review={item.productCode}
              >
                <span>
                  <span className="block font-semibold">{item.productName}</span>
                  <span className="block text-sm text-muted-foreground tabular-nums">
                    Modal sekarang {costLabel(item.costPrice, item.pricingFactor, item.baseUnit)}
                  </span>
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/barang/${item.productId}`}>Buka barang</Link>
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setReview(null)} data-autofocus>
              Mengerti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
