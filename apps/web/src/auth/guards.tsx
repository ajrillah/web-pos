import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthProvider';

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-lg text-slate-700">
      {children}
    </div>
  );
}

/** Shared loading/error handling; returns null when the caller should decide. */
function useGateFallback(): ReactNode | null {
  const { state, refresh } = useAuth();
  if (state.status === 'loading') {
    return <FullScreenMessage>Memuat…</FullScreenMessage>;
  }
  if (state.status === 'error') {
    return (
      <FullScreenMessage>
        <div className="space-y-4 text-center">
          <p className="text-red-700">{state.message}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded bg-slate-800 px-4 py-2 text-white"
          >
            Coba lagi
          </button>
        </div>
      </FullScreenMessage>
    );
  }
  return null;
}

/** Logged-in pages. Sends users to setup, login, or the forced PIN change as needed. */
export function RequireUser() {
  const { state } = useAuth();
  const fallback = useGateFallback();
  if (fallback) return fallback;
  if (state.status === 'needsSetup') return <Navigate to="/setup" replace />;
  if (state.status !== 'authenticated') return <Navigate to="/login" replace />;
  if (state.user.mustChangePin) return <Navigate to="/ubah-pin" replace />;
  return <Outlet />;
}

/** Login and PIN recovery: only for visitors without a session. */
export function RequireAnonymous() {
  const { state } = useAuth();
  const fallback = useGateFallback();
  if (fallback) return fallback;
  if (state.status === 'needsSetup') return <Navigate to="/setup" replace />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** First-run setup: only while no user exists. */
export function RequireSetup() {
  const { state } = useAuth();
  const fallback = useGateFallback();
  if (fallback) return fallback;
  if (state.status !== 'needsSetup') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Forced PIN change after login with a temporary PIN. */
export function RequirePendingPinChange() {
  const { state } = useAuth();
  const fallback = useGateFallback();
  if (fallback) return fallback;
  if (state.status !== 'authenticated') return <Navigate to="/login" replace />;
  if (!state.user.mustChangePin) return <Navigate to="/" replace />;
  return <Outlet />;
}
