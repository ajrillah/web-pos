import { useCurrentUser } from '../auth/AuthProvider';
import { PageHeader } from '../layout/PageHeader';
import { roleLabels } from '../navigation/menu';

// Placeholder home; `/` becomes the Kasir screen in Stage 3.
export function HomePage() {
  const user = useCurrentUser();
  return (
    <PageHeader
      title={`Selamat datang, ${user.name}`}
      description={`Anda masuk sebagai ${roleLabels[user.role]}.`}
    />
  );
}
