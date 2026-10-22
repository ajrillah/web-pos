import { Outlet } from 'react-router';
import { useCurrentUser } from '../../auth/AuthProvider';
import { PageTabs } from '../../layout/PageTabs';
import { productTabsFor } from '../../navigation/menu';

/** Barang: tabs for Daftar, Kategori, and Impor above the content. */
export function ProductsLayout() {
  const user = useCurrentUser();
  return (
    <>
      <PageTabs label="Barang" items={productTabsFor(user.role)} />
      <Outlet />
    </>
  );
}
