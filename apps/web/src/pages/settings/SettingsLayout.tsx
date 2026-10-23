import { type ReactNode, useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { health } from '../../api/endpoints';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { settingsHomeFor, settingsTabsFor } from '../../navigation/menu';

/** Pengaturan: tabs for its sub-pages above the content; the app version at the bottom. */
export function SettingsLayout() {
  const user = useCurrentUser();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    health()
      .then((h) => setVersion(h.version))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <PageTabs label="Pengaturan" items={settingsTabsFor(user.role)} />
      <Outlet />
      <footer className="mt-10 text-sm text-muted-foreground" data-testid="app-version">
        TOKO PODOMORO
        {version && (
          <>
            {' '}
            · versi <span className="font-mono">{version}</span>
          </>
        )}
      </footer>
    </>
  );
}

/** `/pengaturan` opens the first tab the user can use without approval. */
export function SettingsIndex() {
  const user = useCurrentUser();
  return <Navigate to={settingsHomeFor(user.role)} replace />;
}

/** Owner-only settings page; cashiers are sent to their Pengaturan home. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (user.role !== 'owner') return <Navigate to={settingsHomeFor(user.role)} replace />;
  return children;
}
