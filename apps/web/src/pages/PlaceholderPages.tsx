import { Construction, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useCurrentUser } from '../auth/AuthProvider';
import { Card } from '../components/ui/card';
import { PageHeader } from '../layout/PageHeader';
import { requiresOwnerPin } from '../navigation/menu';

/** Page whose feature is scheduled for a later roadmap stage. */
export function ComingSoonPage({ title, stage }: { title: string; stage: number }) {
  return (
    <section>
      <PageHeader title={title} />
      <Card className="flex items-center gap-4 p-6">
        <Construction className="size-6 text-faint" aria-hidden />
        <p className="text-muted-foreground">Fitur ini sedang dikembangkan (tahap {stage}).</p>
      </Card>
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
    <section>
      <PageHeader title={title} />
      <p
        role="alert"
        className="flex items-center gap-3 rounded-control border border-warning-border bg-warning-soft px-5 py-4 text-warning-foreground"
      >
        <Lock className="size-5 shrink-0" aria-hidden />
        Halaman ini memerlukan persetujuan pemilik (PIN). Minta pemilik untuk membukanya.
      </p>
    </section>
  );
}
