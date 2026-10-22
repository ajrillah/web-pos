import { Download, FileText, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api, type ReceiptKind, receipts } from '../../api/endpoints';
import { ErrorAlert } from '../forms';
import { Button } from '../ui/button';
import { Kbd } from '../ui/kbd';

/** Buka (default PDF viewer), Buka folder (Explorer), Unduh (browser download), Tutup. */
export function ReceiptActions({
  kind,
  id,
  onClose,
  autoFocusClose = false,
}: {
  kind: ReceiptKind;
  id: string;
  onClose?: () => void;
  autoFocusClose?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const run = (task: () => Promise<unknown>) => {
    setError(null);
    task().catch((err: unknown) => setError(errorMessage(err)));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run(() => receipts.open(kind, id))}>
          <FileText className="size-[18px]" aria-hidden />
          Buka
        </Button>
        <Button variant="outline" onClick={() => run(() => api.openReceiptFolder())}>
          <FolderOpen className="size-[18px]" aria-hidden />
          Buka folder
        </Button>
        <Button variant="outline" asChild>
          <a href={receipts.downloadUrl(kind, id)} download>
            <Download className="size-[18px]" aria-hidden />
            Unduh
          </a>
        </Button>
        {onClose && (
          <Button className="ml-auto" onClick={onClose} autoFocus={autoFocusClose}>
            Tutup <Kbd>Esc</Kbd>
          </Button>
        )}
      </div>
      <ErrorAlert message={error} />
    </div>
  );
}
