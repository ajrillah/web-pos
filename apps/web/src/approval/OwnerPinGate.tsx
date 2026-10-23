import type { MenuScope } from '@toko-podomoro/shared';
import { Lock } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { setMenuApprovalToken } from '../api/client';
import { api } from '../api/endpoints';
import { useCurrentUser } from '../auth/AuthProvider';
import { Button } from '../components/ui/button';
import { PageHeader } from '../layout/PageHeader';
import { useApproval } from './ApprovalProvider';

/**
 * PIN menu (Laporan, Pengguna, Profil Toko, Impor barang). Owners pass. Cashiers get the owner PIN dialog;
 * the menu token is sent with every request while the page is open and released on leaving.
 */
export function OwnerPinGate({
  scope,
  title,
  children,
}: {
  scope: MenuScope;
  title: string;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  // Each attempt is a fresh gate, so "Minta persetujuan pemilik" asks again after a cancel.
  const [attempt, setAttempt] = useState(0);
  if (user.role === 'owner') return children;
  return (
    <CashierMenuGate
      key={attempt}
      scope={scope}
      title={title}
      onRetry={() => setAttempt((n) => n + 1)}
    >
      {children}
    </CashierMenuGate>
  );
}

function CashierMenuGate({
  scope,
  title,
  onRetry,
  children,
}: {
  scope: MenuScope;
  title: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { requestApproval } = useApproval();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    let granted: string | null = null;
    void requestApproval(scope).then((t) => {
      if (!current) {
        if (t) void api.releaseApproval(t).catch(() => undefined);
        return;
      }
      granted = t;
      setMenuApprovalToken(t);
      setToken(t);
    });
    return () => {
      current = false;
      if (granted) {
        setMenuApprovalToken(null);
        void api.releaseApproval(granted).catch(() => undefined);
      }
    };
  }, [scope, requestApproval]);

  if (token) return children;
  return (
    <section>
      <PageHeader title={title} />
      <div className="flex items-center gap-4 rounded-control border border-warning-border bg-warning-soft px-5 py-4 text-warning-foreground">
        <Lock className="size-5 shrink-0" aria-hidden />
        <span className="flex-1">Halaman ini memerlukan persetujuan pemilik (PIN).</span>
        <Button variant="outline" onClick={onRetry}>
          Minta persetujuan pemilik
        </Button>
      </div>
    </section>
  );
}
