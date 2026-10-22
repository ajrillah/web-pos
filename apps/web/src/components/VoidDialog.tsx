import { useState } from 'react';
import { errorMessage } from '../api/client';
import { FormDialog } from './FormDialog';
import { TextField } from './forms';

/** Confirms a void with an optional reason; `onVoid` runs it (with owner approval if needed). */
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
  onVoid: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <FormDialog
      open={open}
      title={title}
      description={description}
      submitLabel="Batalkan"
      destructive
      onClose={() => {
        setReason('');
        onClose();
      }}
      onSubmit={async () => {
        try {
          await onVoid(reason.trim());
          setReason('');
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      }}
    >
      <TextField
        id="void-reason"
        label="Alasan (opsional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
        autoComplete="off"
      />
    </FormDialog>
  );
}
