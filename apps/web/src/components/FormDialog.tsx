import { type FormEvent, type ReactNode, useState } from 'react';
import { ErrorAlert } from './forms';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/** Dialog with a form: Enter submits, Esc closes, errors stay inline. */
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  destructive = false,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  /** Red submit button (void, cancel). */
  destructive?: boolean;
  onClose: () => void;
  /** Returns an error message to show, or null on success. */
  onSubmit: () => Promise<string | null>;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await onSubmit());
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {children}
          <ErrorAlert message={error} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
              {busy ? 'Memproses…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
