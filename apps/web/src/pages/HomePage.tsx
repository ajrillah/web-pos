import { type HealthResponse, healthResponseSchema } from '@toko-podomoro/shared';
import { useEffect, useState } from 'react';

type ServerStatus =
  | { state: 'loading' }
  | { state: 'ok'; health: HealthResponse }
  | { state: 'error' };

export function HomePage() {
  const [status, setStatus] = useState<ServerStatus>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((res) => res.json())
      .then((body: unknown) => setStatus({ state: 'ok', health: healthResponseSchema.parse(body) }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus({ state: 'error' });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold">Selamat datang</h1>
      {status.state === 'loading' && <p>Memeriksa server…</p>}
      {status.state === 'ok' && (
        <p className="text-green-700">Server aktif (versi {status.health.version}).</p>
      )}
      {status.state === 'error' && <p className="text-red-700">Server tidak dapat dihubungi.</p>}
    </section>
  );
}
