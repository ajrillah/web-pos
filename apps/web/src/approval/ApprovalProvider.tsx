import type { ApprovalScope, LoginUser } from '@toko-podomoro/shared';
import { ShieldCheck } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { ApiRequestError, errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { useCurrentUser } from '../auth/AuthProvider';
import { ErrorAlert } from '../components/forms';
import { PinPad } from '../components/PinPad';
import { UserTile } from '../components/UserTile';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

// Owner approval for cashiers (docs/design.md 5): the owner types their PIN on the cashier's
// screen; the server returns a token for that scope (and target).

export const SCOPE_LABELS: Record<ApprovalScope, string> = {
  'sale.void': 'membatalkan transaksi',
  'payment.void': 'membatalkan pembayaran kasbon',
  'product.price': 'mengubah harga atau menambah satuan barang',
  'product.deactivate': 'menonaktifkan barang',
  'category.manage': 'mengubah kategori',
  'purchase.void': 'membatalkan stok masuk',
  'purchase.cost': 'mengubah harga modal dari stok masuk',
  'supplier-payment.void': 'membatalkan pembayaran hutang',
  laporan: 'membuka Laporan',
  pengguna: 'membuka Pengguna',
  'profil-toko': 'membuka Profil Toko',
};

/** The cashier closed the approval dialog. */
export class ApprovalCancelled extends Error {
  constructor() {
    super('Persetujuan pemilik dibatalkan.');
    this.name = 'ApprovalCancelled';
  }
}

interface Pending {
  scope: ApprovalScope;
  targetId?: string | undefined;
  resolve: (token: string | null) => void;
}

interface ApprovalContextValue {
  /** Opens the owner PIN dialog; resolves to the token, or null if cancelled. */
  requestApproval: (scope: ApprovalScope, targetId?: string) => Promise<string | null>;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Several active owners: the cashier first picks whose PIN will be typed.
  const [owners, setOwners] = useState<LoginUser[] | null>(null);
  const [owner, setOwner] = useState<LoginUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestApproval = useCallback(
    (scope: ApprovalScope, targetId?: string) =>
      new Promise<string | null>((resolve) => {
        setOwner(null);
        setOwners(null);
        setLoadError(null);
        setPending({ scope, targetId, resolve });
        api
          .loginUsers()
          .then((r) => {
            const active = r.users.filter((u) => u.role === 'owner');
            setOwners(active);
            if (active.length === 1) setOwner(active[0] ?? null);
          })
          .catch((err: unknown) => setLoadError(errorMessage(err)));
      }),
    [],
  );

  function finish(token: string | null) {
    pending?.resolve(token);
    setPending(null);
  }

  const severalOwners = owners !== null && owners.length > 1;

  async function approve(pin: string): Promise<string | null> {
    if (!pending) return null;
    try {
      const { token } = await api.approve({
        pin,
        scope: pending.scope,
        ...(pending.targetId ? { targetId: pending.targetId } : {}),
        ...(severalOwners && owner ? { ownerId: owner.id } : {}),
      });
      finish(token);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  return (
    <ApprovalContext.Provider value={{ requestApproval }}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(next) => !next && finish(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-6 text-primary" aria-hidden />
              Persetujuan pemilik
            </DialogTitle>
            <DialogDescription>
              {owner ? `${owner.name} memasukkan PIN` : 'Pilih pemilik yang menyetujui'} untuk{' '}
              {pending ? SCOPE_LABELS[pending.scope] : ''}.
            </DialogDescription>
          </DialogHeader>
          <ErrorAlert message={loadError} />
          {pending && severalOwners && !owner && (
            <div className="flex flex-wrap justify-center gap-3">
              {owners.map((o) => (
                <UserTile key={o.id} user={o} onClick={() => setOwner(o)} />
              ))}
            </div>
          )}
          {pending && owner && (
            <div className="space-y-3">
              <PinPad
                key={`${pending.scope}-${pending.targetId}-${owner.id}`}
                label={`PIN ${owner.name}`}
                onSubmit={approve}
              />
              {severalOwners && (
                <div className="text-center">
                  <Button variant="ghost" size="sm" onClick={() => setOwner(null)}>
                    Pilih pemilik lain
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ApprovalContext.Provider>
  );
}

export function useApproval() {
  const value = useContext(ApprovalContext);
  if (!value) throw new Error('useApproval must be used inside <ApprovalProvider>');
  const user = useCurrentUser();
  const { requestApproval } = value;
  // Keeps the latest user without changing the callback identity.
  const role = useRef(user.role);
  role.current = user.role;

  /**
   * Runs `call`; when the server answers OWNER_APPROVAL_REQUIRED, asks for the owner's PIN
   * and runs it again with the token. Owners never see the dialog.
   */
  const withApproval = useCallback(
    async <T,>(
      scope: ApprovalScope,
      targetId: string | undefined,
      call: (approvalToken?: string) => Promise<T>,
    ): Promise<T> => {
      try {
        return await call();
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.code === 'OWNER_APPROVAL_REQUIRED')) throw err;
        const token = await requestApproval(scope, targetId);
        if (!token) throw new ApprovalCancelled();
        return call(token);
      }
    },
    [requestApproval],
  );

  return { requestApproval, withApproval };
}
