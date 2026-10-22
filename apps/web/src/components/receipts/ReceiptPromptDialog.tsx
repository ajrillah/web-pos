import type { ReceiptSavedResponse } from '@toko-podomoro/shared';
import { CircleCheck } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { errorMessage } from '../../api/client';
import { type ReceiptKind, receipts } from '../../api/endpoints';
import { ErrorAlert } from '../forms';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Kbd } from '../ui/kbd';
import { ReceiptActions } from './ReceiptActions';

const QUESTION: Record<ReceiptKind, string> = {
  sale: 'Simpan nota PDF?',
  payment: 'Simpan bukti bayar PDF?',
};

/**
 * After a sale or kasbon payment: asks to save the receipt PDF (Enter = save, Esc = skip),
 * then shows where it was saved with Buka, Buka folder, and Unduh.
 */
export function ReceiptPromptDialog({
  doc,
  title,
  summary,
  onClose,
  onClosed,
}: {
  doc: { kind: ReceiptKind; id: string; number: string } | null;
  title: string;
  /** The amount to show big: change, kasbon, remaining kasbon, ... */
  summary?: ReactNode;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const [saved, setSaved] = useState<ReceiptSavedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await receipts.save(doc.kind, doc.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={doc !== null}
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
          if (onClosed) {
            e.preventDefault();
            onClosed();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheck className="size-6 text-primary" aria-hidden />
            {saved ? (doc?.kind === 'payment' ? 'Bukti bayar tersimpan' : 'Nota tersimpan') : title}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{doc?.number}</span>
            {saved && (
              <>
                {' '}
                · {saved.fileName}
                <span className="block break-all">{saved.folder}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {summary}
        <ErrorAlert message={error} />
        {doc &&
          (saved ? (
            <ReceiptActions kind={doc.kind} id={doc.id} autoFocusClose onClose={onClose} />
          ) : (
            <div className="space-y-3">
              <p className="text-lg font-semibold">{QUESTION[doc.kind]}</p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onClose}>
                  Lewati <Kbd>Esc</Kbd>
                </Button>
                <Button onClick={() => void save()} disabled={busy} data-autofocus>
                  {busy
                    ? 'Menyimpan…'
                    : doc.kind === 'payment'
                      ? 'Simpan bukti bayar'
                      : 'Simpan nota'}{' '}
                  <Kbd>Enter</Kbd>
                </Button>
              </div>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}

/** Big amount block: green for change, gold for kasbon (docs/ui-style.md color meanings). */
export function AmountBlock({
  label,
  amount,
  tone,
  testId,
}: {
  label: string;
  amount: string;
  tone: 'change' | 'kasbon' | 'neutral';
  testId?: string;
}) {
  const tones = {
    change: 'bg-success-soft text-success',
    kasbon: 'border border-warning-border bg-warning-soft text-warning-foreground',
    neutral: 'bg-muted text-foreground',
  };
  return (
    <div className={`flex items-baseline justify-between rounded-[20px] px-5 py-4 ${tones[tone]}`}>
      <span className="label-caps text-current">{label}</span>
      <span className="text-[36px] leading-tight font-bold tabular-nums" data-testid={testId}>
        {amount}
      </span>
    </div>
  );
}
