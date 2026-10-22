import type { User } from '@toko-podomoro/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ApiRequestError, SESSION_LOCKED_EVENT, setMenuApprovalToken } from '../api/client';
import { api } from '../api/endpoints';

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'needsSetup' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User; locked: boolean };

interface AuthContextValue {
  state: AuthState;
  /** Re-reads setup status and the current session from the server. */
  refresh: () => Promise<void>;
  /** Marks the user as logged in (and unlocked) without another round trip. */
  signedIn: (user: User) => void;
  /** Locks the screen (Ctrl+L or idle); only the same user can unlock. */
  lock: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadState(): Promise<AuthState> {
  try {
    if ((await api.setupStatus()).needsSetup) {
      return { status: 'needsSetup' };
    }
    const me = await api.me();
    return { status: 'authenticated', user: me.user, locked: me.locked };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return { status: 'anonymous' };
    }
    return {
      status: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Terjadi kesalahan.',
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState(await loadState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signedIn = useCallback(
    (user: User) => setState({ status: 'authenticated', user, locked: false }),
    [],
  );

  const markLocked = useCallback(() => {
    setMenuApprovalToken(null);
    setState((current) =>
      current.status === 'authenticated' ? { ...current, locked: true } : current,
    );
  }, []);

  const lock = useCallback(async () => {
    await api.lock().catch(() => undefined);
    markLocked();
  }, [markLocked]);

  // Another tab locked the session, or a request was refused as locked.
  useEffect(() => {
    window.addEventListener(SESSION_LOCKED_EVENT, markLocked);
    return () => window.removeEventListener(SESSION_LOCKED_EVENT, markLocked);
  }, [markLocked]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setMenuApprovalToken(null);
    setState({ status: 'anonymous' });
  }, []);

  return (
    <AuthContext.Provider value={{ state, refresh, signedIn, lock, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

/** The logged-in user; only use under <RequireUser>. */
export function useCurrentUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') {
    throw new Error('useCurrentUser requires an authenticated session');
  }
  return state.user;
}
