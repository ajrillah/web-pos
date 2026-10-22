import { useAuth, useCurrentUser } from '../../auth/AuthProvider';
import { AuthCard } from '../../components/forms';
import { ChangePinForm } from './ChangePinForm';

/** After login with a temporary PIN: the user must choose their own before anything else. */
export function ForcedChangePinPage() {
  const { signedIn, logout } = useAuth();
  const user = useCurrentUser();
  return (
    <AuthCard
      title="Ganti PIN"
      description={
        <>
          Halo, <strong className="text-foreground">{user.name}</strong>. PIN Anda masih sementara.
          Buat PIN baru yang hanya Anda ketahui sebelum melanjutkan.
        </>
      }
    >
      <ChangePinForm onDone={signedIn} />
      <p className="text-center text-sm">
        <button
          type="button"
          onClick={() => void logout()}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Keluar
        </button>
      </p>
    </AuthCard>
  );
}
