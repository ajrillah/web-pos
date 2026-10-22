import type { User } from '@toko-podomoro/shared';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { checkPin, ErrorAlert, PinField, PrimaryButton } from '../../components/forms';
import { RecoveryCodeNotice } from '../../components/RecoveryCodeNotice';

/**
 * Changes the user's own PIN. A new owner gets their first recovery code here; `onDone` runs
 * after they confirm it was written down (or right away when no code was issued).
 */
export function ChangePinForm({ onDone }: { onDone: (user: User) => void }) {
  const [form, setForm] = useState({ currentPin: '', newPin: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ user: User; code: string } | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem =
      checkPin(form.currentPin) ??
      checkPin(form.newPin, form.confirm) ??
      (form.currentPin === form.newPin ? 'PIN baru harus berbeda dari PIN saat ini.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.changePin({ currentPin: form.currentPin, newPin: form.newPin });
      setForm({ currentPin: '', newPin: '', confirm: '' });
      if (result.recoveryCode) {
        setIssued({ user: result.user, code: result.recoveryCode });
      } else {
        toast.success('PIN berhasil diubah.');
        onDone(result.user);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <RecoveryCodeNotice
        code={issued.code}
        continueLabel="Lanjut"
        onContinue={() => onDone(issued.user)}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PinField
        id="currentPin"
        label="PIN saat ini"
        value={form.currentPin}
        onChange={set('currentPin')}
        autoFocus
      />
      <PinField
        id="newPin"
        label="PIN baru (6 angka)"
        value={form.newPin}
        onChange={set('newPin')}
      />
      <PinField
        id="confirm"
        label="Ulangi PIN baru"
        value={form.confirm}
        onChange={set('confirm')}
      />
      <ErrorAlert message={error} />
      <PrimaryButton busy={busy}>Simpan PIN baru</PrimaryButton>
    </form>
  );
}
