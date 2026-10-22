import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import {
  AuthCard,
  checkPin,
  ErrorAlert,
  PinField,
  PrimaryButton,
  TextField,
} from '../../components/forms';

export function LoginPage() {
  const { signedIn } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = username.trim() ? checkPin(pin) : 'Nama pengguna wajib diisi.';
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      signedIn((await api.login({ username, pin })).user);
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Masuk">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          id="username"
          label="Nama pengguna"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoFocus
        />
        <PinField id="pin" label="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
        <ErrorAlert message={error} />
        <PrimaryButton busy={busy}>Masuk</PrimaryButton>
      </form>
      <p className="text-center text-sm">
        <Link to="/pulihkan-pin" className="text-blue-700 underline">
          Pemilik lupa PIN?
        </Link>
      </p>
    </AuthCard>
  );
}
