import { formatRupiah, type ReceiptSavedResponse, type Sale } from '@toko-podomoro/shared';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Kbd } from '../../components/ui/kbd';
import { ReceiptActions } from './ReceiptActions';

/**
 * After payment: "Simpan nota PDF?" (Enter = save, Esc = skip), then "Nota tersimpan" with
 * Buka, Buka folder, and Unduh.
 */
export function AfterSaleDialog({
  sale,
  onClose,
  onClosed,
}: {
  sale: Sale | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [saved, setSaved] = useState<ReceiptSavedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!sale) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await api.saveReceipt(sale.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={sale !== null}
      onOpenChange={(next) => {
        if (!next) {
          setSaved(null);
          setError(null);
          onClose();
        }
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
          <DialogTitle className="flex items-center gap-2">
            <CircleCheck className="size-6 text-primary" aria-hidden />
            {saved ? 'Nota tersimpan' : 'Transaksi selesai'}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{sale?.number}</span>
            {saved && (
              <>
                {' '}
                · {saved.fileName}
                <span className="block break-all">{saved.folder}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <div className="flex items-baseline justify-between rounded-[20px] bg-success-soft px-5 py-4">
            <span className="label-caps">Kembalian</span>
            <span
              className="text-[40px] leading-tight font-bold text-success tabular-nums"
              data-testid="change-amount"
            >
              {formatRupiah(sale.changeAmount)}
            </span>
          </div>
        )}
        <ErrorAlert message={error} />
        {sale &&
          (saved ? (
            <ReceiptActions saleId={sale.id} autoFocusClose onClose={onClose} />
          ) : (
            <div className="space-y-3">
              <p className="text-lg font-semibold">Simpan nota PDF?</p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Lewati <Kbd>Esc</Kbd>
                </Button>
                <Button onClick={() => void save()} disabled={busy} data-autofocus>
                  {busy ? 'Menyimpan…' : 'Simpan nota'} <Kbd>Enter</Kbd>
                </Button>
              </div>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
