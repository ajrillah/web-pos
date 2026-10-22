import { useCurrentUser } from '../auth/AuthProvider';
import { roleLabels } from '../navigation/menu';

export function HomePage() {
  const user = useCurrentUser();
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold">Selamat datang, {user.name}</h1>
      <p className="text-slate-600">Anda masuk sebagai {roleLabels[user.role]}.</p>
    </section>
  );
}
