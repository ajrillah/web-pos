import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { PageHeader } from '../layout/PageHeader';

export function NotFoundPage() {
  return (
    <section>
      <PageHeader title="Halaman tidak ditemukan" />
      <Button variant="outline" asChild>
        <Link to="/">Kembali ke Beranda</Link>
      </Button>
    </section>
  );
}
