import type { User } from '@toko-podomoro/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ApiRequestError } from '../api/client';
import { api } from '../api/endpoints';

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'needsSetup' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  /** Re-reads setup status and the current session from the server. */
  refresh: () => Promise<void>;
  /** Marks the user as logged in without another round trip. */
  signedIn: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadState(): Promise<AuthState> {
  try {
    if ((await api.setupStatus()).needsSetup) {
      return { status: 'needsSetup' };
    }
    return { status: 'authenticated', user: (await api.me()).user };
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

  const signedIn = useCallback((user: User) => setState({ status: 'authenticated', user }), []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ status: 'anonymous' });
  }, []);

  return (
    <AuthContext.Provider value={{ state, refresh, signedIn, logout }}>
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
