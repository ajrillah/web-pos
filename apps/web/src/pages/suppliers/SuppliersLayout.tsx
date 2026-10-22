import { Outlet } from 'react-router';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { supplierTabsFor } from '../../navigation/menu';

/** Pemasok: tabs for Daftar, Kartu Hutang, and Daftar Hutang. */
export function SuppliersLayout() {
  const user = useCurrentUser();
  return (
    <>
      <PageTabs label="Pemasok" items={supplierTabsFor(user.role)} />
      <Outlet />
    </>
  );
}
