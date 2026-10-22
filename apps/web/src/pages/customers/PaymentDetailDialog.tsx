import { type CustomerPayment, formatRupiah } from '@toko-podomoro/shared';
import { Ban, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api, receipts } from '../../api/endpoints';
import { useApproval } from '../../approval/ApprovalProvider';
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
import { VoidDialog } from '../../components/VoidDialog';
import { dateTime } from '../history/SaleDetailDialog';

/** A kasbon payment: allocations, amounts, and receipt actions (save a copy, open, download). */
export function PaymentDetailDialog({
  paymentId,
  onClose,
  onChanged,
}: {
  paymentId: string | null;
  onClose: () => void;
  /** The payment was voided; the ledger reloads. */
  onChanged?: () => void;
}) {
  const [payment, setPayment] = useState<CustomerPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const { withApproval } = useApproval();

  useEffect(() => {
    setPayment(null);
    setError(null);
    if (paymentId) {
      api
        .getCustomerPayment(paymentId)
        .then((r) => setPayment(r.payment))
        .catch((err: unknown) => setError(errorMessage(err)));
    }
  }, [paymentId]);

  async function save() {
    if (!payment) return;
    try {
      const saved = await receipts.save('payment', payment.id);
      toast.success(`Bukti bayar disimpan: ${saved.fileName}`);
      setPayment((await api.getCustomerPayment(payment.id)).payment);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

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
              `${dateTime(payment.createdAt)} · ${payment.customerName} · Kasir ${payment.userName}`}
          </DialogDescription>
        </DialogHeader>
        <ErrorAlert message={error} />
        {payment && (
          <div className="space-y-4">
            <ul className="space-y-1">
              {payment.allocations.map((a) => (
                <li key={a.receivableId} className="flex justify-between rounded-row px-3 py-2">
                  <span>
                    <span className="block font-mono text-[15px]">{a.saleNumber}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      sisa {formatRupiah(a.remainingAfter)}
                    </span>
                  </span>
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
                <dt className="text-muted-foreground">
                  {payment.method === 'cash' ? 'Tunai' : 'QRIS'}
                </dt>
                <dd>{formatRupiah(payment.amountReceived)}</dd>
              </div>
              {payment.method === 'cash' && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Kembalian</dt>
                  <dd>{formatRupiah(payment.changeAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sisa kasbon setelah bayar</dt>
                <dd className="font-semibold text-warning-foreground">
                  {formatRupiah(payment.balanceAfter)}
                </dd>
              </div>
            </dl>
            <div className="space-y-3 border-t border-border pt-4">
              <Button onClick={() => void save()}>
                <Save className="size-[18px]" aria-hidden />
                {payment.receiptCount > 0 ? 'Simpan salinan bukti bayar' : 'Simpan bukti bayar'}
              </Button>
              <ReceiptActions kind="payment" id={payment.id} />
            </div>
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
          description="Kasbon yang dibayar kembali terbuka sebesar pembayaran ini."
          onClose={() => setVoiding(false)}
          onVoid={async (reason) => {
            const { payment: voided } = await withApproval('payment.void', payment.id, (token) =>
              api.voidCustomerPayment(payment.id, reason ? { reason } : {}, token),
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
