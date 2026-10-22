import { VOID_REASON_LABELS, type VoidReason, type VoidRequest } from '@toko-podomoro/shared';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { cn } from '../lib/utils';
import { FormDialog } from './FormDialog';
import { TextField } from './forms';

const REASONS = Object.keys(VOID_REASON_LABELS) as VoidReason[];

/**
 * Confirms a void. A reason is required: "Salah input", "Pembeli batal", or "Lainnya"
 * with a note. `onVoid` runs it (with owner approval if needed).
 */
export function VoidDialog({
  open,
  title,
  description,
  onClose,
  onVoid,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onVoid: (input: VoidRequest) => Promise<void>;
}) {
  const [reason, setReason] = useState<VoidReason | null>(null);
  const [note, setNote] = useState('');

  function reset() {
    setReason(null);
    setNote('');
  }

  return (
    <FormDialog
      open={open}
      title={title}
      description={description}
      submitLabel="Batalkan"
      destructive
      resetErrorOn={`${reason}-${note.trim() !== ''}`}
      onClose={() => {
        reset();
        onClose();
      }}
      onSubmit={async () => {
        if (!reason) return 'Pilih alasan pembatalan.';
        if (reason === 'lainnya' && !note.trim()) return 'Tulis alasan pembatalan.';
        try {
          await onVoid(reason === 'lainnya' ? { reason, note: note.trim() } : { reason });
          reset();
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-muted-foreground">Alasan</legend>
        <div className="flex gap-2">
          {REASONS.map((value, index) => (
            <label
              key={value}
              className={cn(
                'flex h-12 flex-1 cursor-pointer items-center justify-center rounded-control border px-3 font-semibold whitespace-nowrap transition-colors',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-primary-soft',
                reason === value
                  ? 'border-destructive bg-destructive-soft text-destructive'
                  : 'border-border bg-card hover:bg-muted',
              )}
            >
              <input
                type="radio"
                name="void-reason"
                value={value}
                data-void-reason={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                // biome-ignore lint/a11y/noAutofocus: the first choice takes focus when the dialog opens.
                autoFocus={index === 0}
                className="sr-only"
              />
              {VOID_REASON_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {reason === 'lainnya' && (
        <TextField
          id="void-note"
          label="Keterangan"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      )}
    </FormDialog>
  );
}
