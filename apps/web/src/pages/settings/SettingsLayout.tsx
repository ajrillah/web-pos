import { Navigate, Outlet } from 'react-router';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { settingsHomeFor, settingsTabsFor } from '../../navigation/menu';

/** Pengaturan: tabs for its sub-pages above the content. */
export function SettingsLayout() {
  const user = useCurrentUser();
  return (
    <>
      <PageTabs label="Pengaturan" items={settingsTabsFor(user.role)} />
      <Outlet />
    </>
  );
}

/** `/pengaturan` opens the first tab the user can use without approval. */
export function SettingsIndex() {
  const user = useCurrentUser();
  return <Navigate to={settingsHomeFor(user.role)} replace />;
}
