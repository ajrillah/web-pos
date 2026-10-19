import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold">Halaman tidak ditemukan</h1>
      <Link to="/" className="text-blue-700 underline">
        Kembali ke Beranda
      </Link>
    </section>
  );
}
