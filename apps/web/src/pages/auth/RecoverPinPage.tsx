import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import {
  AuthCard,
  checkPin,
  ErrorAlert,
  PinField,
  PrimaryButton,
  TextField,
} from '../../components/forms';
import { RecoveryCodeNotice } from '../../components/RecoveryCodeNotice';

/** Owner resets their own PIN with their recovery code; a new code replaces the used one. */
export function RecoverPinPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', recoveryCode: '', newPin: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem =
      (form.username.trim() && form.recoveryCode.trim()
        ? null
        : 'Nama pengguna dan kode pemulihan wajib diisi.') ?? checkPin(form.newPin, form.confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.recover({
        username: form.username,
        recoveryCode: form.recoveryCode,
        newPin: form.newPin,
      });
      setNewCode(result.recoveryCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return (
      <AuthCard
        title="PIN berhasil diatur ulang"
        description="Kode pemulihan lama tidak berlaku lagi. Simpan kode baru di bawah ini."
      >
        <RecoveryCodeNotice
          code={newCode}
          continueLabel="Ke halaman masuk"
          onContinue={() => navigate('/login', { replace: true })}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Pulihkan PIN pemilik"
      description="Masukkan kode pemulihan yang Anda catat saat membuat akun. Kasir yang lupa PIN dapat meminta pemilik mengatur ulang PIN-nya."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          id="username"
          label="Nama pengguna pemilik"
          value={form.username}
          onChange={set('username')}
          autoCapitalize="none"
          autoFocus
        />
        <TextField
          id="recoveryCode"
          label="Kode pemulihan"
          value={form.recoveryCode}
          onChange={set('recoveryCode')}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="[&_input]:font-mono [&_input]:tracking-[0.08em]"
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
        <PrimaryButton busy={busy}>Atur ulang PIN</PrimaryButton>
      </form>
      <p className="text-center text-sm">
        <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Kembali ke halaman masuk
        </Link>
      </p>
    </AuthCard>
  );
}
