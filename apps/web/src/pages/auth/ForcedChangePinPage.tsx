import { useAuth, useCurrentUser } from '../../auth/AuthProvider';
import { AuthCard } from '../../components/forms';
import { ChangePinForm } from './ChangePinForm';

/** After login with a temporary PIN: the user must choose their own before anything else. */
export function ForcedChangePinPage() {
  const { signedIn, logout } = useAuth();
  const user = useCurrentUser();
  return (
    <AuthCard title="Ganti PIN">
      <p className="text-slate-600">
        Halo, <strong>{user.name}</strong>. PIN Anda masih sementara. Buat PIN baru yang hanya Anda
        ketahui sebelum melanjutkan.
      </p>
      <ChangePinForm onDone={signedIn} />
      <p className="text-center text-sm">
        <button type="button" onClick={() => void logout()} className="text-blue-700 underline">
          Keluar
        </button>
      </p>
    </AuthCard>
  );
}
