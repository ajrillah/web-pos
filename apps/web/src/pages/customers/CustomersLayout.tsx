import { Outlet } from 'react-router';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { customerTabsFor } from '../../navigation/menu';

/** Pelanggan: tabs for Daftar, Kartu Piutang, and Daftar Piutang. */
export function CustomersLayout() {
  const user = useCurrentUser();
  return (
    <>
      <PageTabs label="Pelanggan" items={customerTabsFor(user.role)} />
      <Outlet />
    </>
  );
}
