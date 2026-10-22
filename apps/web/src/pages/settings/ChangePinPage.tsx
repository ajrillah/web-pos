import { useAuth } from '../../auth/AuthProvider';
import { ChangePinForm } from '../auth/ChangePinForm';

export function ChangePinPage() {
  const { signedIn } = useAuth();
  return (
    <section className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Ubah PIN</h1>
      <ChangePinForm onDone={signedIn} />
    </section>
  );
}
