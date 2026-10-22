import type { ReactNode } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/** Yes/no question: Enter confirms (the confirm button has focus), Esc goes back. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Kembali',
  destructive = false,
  onConfirm,
  onCancel,
  onClosed,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Runs after the dialog closes; Kasir uses it to return focus to the search box. */
  onClosed?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          if (onClosed) {
            e.preventDefault();
            onClosed();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel} <span className="font-mono text-xs opacity-70">Esc</span>
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            data-autofocus
          >
            {confirmLabel} <span className="font-mono text-xs opacity-70">Enter</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
