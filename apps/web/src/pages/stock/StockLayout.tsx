import { Outlet } from 'react-router';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { stockTabsFor } from '../../navigation/menu';

/** Stok: tabs for Stok Masuk, Penyesuaian, Opname, and Riwayat. */
export function StockLayout() {
  const user = useCurrentUser();
  return (
    <>
      <PageTabs label="Stok" items={stockTabsFor(user.role)} />
      <Outlet />
    </>
  );
}
