import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useCurrentUser } from '../auth/AuthProvider';
import { requiresOwnerPin } from '../navigation/menu';

/** Page whose feature is scheduled for a later roadmap stage. */
export function ComingSoonPage({ title, stage }: { title: string; stage: number }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-600">Fitur ini sedang dikembangkan (tahap {stage}).</p>
    </section>
  );
}

/** Renders `children` for owners; cashiers see that owner approval is needed. */
export function OwnerPinGate({ title, children }: { title: string; children: ReactNode }) {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  if (!requiresOwnerPin(user.role, pathname)) {
    return children;
  }
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p
        role="alert"
        className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"
      >
        Halaman ini memerlukan persetujuan pemilik (PIN). Minta pemilik untuk membukanya.
      </p>
    </section>
  );
}
