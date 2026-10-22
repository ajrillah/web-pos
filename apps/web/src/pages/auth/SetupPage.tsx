import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import {
  AuthCard,
  checkPin,
  checkUsername,
  ErrorAlert,
  fieldMessages,
  PinField,
  PrimaryButton,
  TextField,
} from '../../components/forms';
import { RecoveryCodeNotice } from '../../components/RecoveryCodeNotice';

/** First run: create the owner account, then show the one-time recovery code. */
export function SetupPage() {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ name: '', username: '', pin: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem =
      (form.name.trim() ? null : fieldMessages.name) ??
      checkUsername(form.username) ??
      checkPin(form.pin, form.confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.setup({ name: form.name, username: form.username, pin: form.pin });
      setRecoveryCode(result.recoveryCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCode) {
    return (
      <AuthCard title="Akun pemilik dibuat">
        <RecoveryCodeNotice
          code={recoveryCode}
          continueLabel="Mulai menggunakan aplikasi"
          onContinue={() => void refresh()}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Pengaturan awal">
      <p className="text-slate-600">
        Buat akun pemilik toko. Akun ini dapat mengelola pengguna lain.
      </p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          id="name"
          label="Nama pemilik"
          value={form.name}
          onChange={set('name')}
          autoFocus
        />
        <TextField
          id="username"
          label="Nama pengguna"
          value={form.username}
          onChange={set('username')}
          autoCapitalize="none"
        />
        <PinField id="pin" label="PIN (6 angka)" value={form.pin} onChange={set('pin')} />
        <PinField id="confirm" label="Ulangi PIN" value={form.confirm} onChange={set('confirm')} />
        <ErrorAlert message={error} />
        <PrimaryButton busy={busy}>Buat akun pemilik</PrimaryButton>
      </form>
    </AuthCard>
  );
}
