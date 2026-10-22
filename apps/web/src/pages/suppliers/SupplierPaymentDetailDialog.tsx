import { formatRupiah, type SupplierPayment, type SupplierVoidReason } from '@toko-podomoro/shared';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { VoidDialog } from '../../components/VoidDialog';
import { dateTime } from '../history/SaleDetailDialog';

export const SUPPLIER_VOID_REASONS: SupplierVoidReason[] = ['salah_input', 'lainnya'];

/** A supplier payment: allocations and amount; void with owner PIN. */
export function SupplierPaymentDetailDialog({
  paymentId,
  onClose,
  onChanged,
}: {
  paymentId: string | null;
  onClose: () => void;
  /** The payment was voided; the page reloads. */
  onChanged?: () => void;
}) {
  const [payment, setPayment] = useState<SupplierPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const { withApproval } = useApproval();

  useEffect(() => {
    setPayment(null);
    setError(null);
    if (paymentId) {
      api
        .getSupplierPayment(paymentId)
        .then((r) => setPayment(r.payment))
        .catch((err: unknown) => setError(errorMessage(err)));
    }
  }, [paymentId]);

  return (
    <Dialog open={paymentId !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{payment?.number ?? 'Pembayaran'}</span>
            {payment?.status === 'voided' && <Badge variant="destructive">Dibatalkan</Badge>}
          </DialogTitle>
          <DialogDescription>
            {payment &&
              `${dateTime(payment.createdAt)} · ${payment.supplierName} · ${payment.userName}`}
          </DialogDescription>
        </DialogHeader>
        <ErrorAlert message={error} />
        {payment && (
          <div className="space-y-4">
            {payment.initialPurchaseId && (
              <p className="text-muted-foreground">Dibayar saat stok masuk dicatat.</p>
            )}
            <ul className="space-y-1">
              {payment.allocations.map((a) => (
                <li key={a.purchaseId} className="flex justify-between rounded-row px-3 py-2">
                  <span className="font-mono text-[15px]">{a.purchaseNumber}</span>
                  <span className="font-semibold tabular-nums">{formatRupiah(a.amount)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-border px-3 pt-3 tabular-nums">
              <div className="flex justify-between text-lg font-bold">
                <dt>Dibayar</dt>
                <dd>{formatRupiah(payment.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Metode</dt>
                <dd>{payment.method === 'cash' ? 'Tunai' : 'QRIS'}</dd>
              </div>
              {payment.voidReason && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Alasan batal</dt>
                  <dd>{payment.voidReason}</dd>
                </div>
              )}
            </dl>
            {payment.status === 'active' && (
              <div className="flex justify-end border-t border-border pt-4">
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive-soft"
                  onClick={() => setVoiding(true)}
                >
                  <Ban className="size-[18px]" aria-hidden />
                  Batalkan pembayaran
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
      {payment && (
        <VoidDialog
          open={voiding}
          title={`Batalkan ${payment.number}?`}
          description="Jumlah pembayaran ini kembali menjadi hutang."
          reasons={SUPPLIER_VOID_REASONS}
          onClose={() => setVoiding(false)}
          onVoid={async (input) => {
            const { payment: voided } = await withApproval(
              'supplier-payment.void',
              payment.id,
              (token) => api.voidSupplierPayment(payment.id, input, token),
            );
            setPayment(voided);
            setVoiding(false);
            toast.success(`${voided.number} dibatalkan.`);
            onChanged?.();
          }}
        />
      )}
    </Dialog>
  );
}
