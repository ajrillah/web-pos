import { createBrowserRouter, Navigate } from 'react-router';
import { OwnerPinGate } from './approval/OwnerPinGate';
import {
  RequireAnonymous,
  RequirePendingPinChange,
  RequireSetup,
  RequireUser,
} from './auth/guards';
import { ShortcutLayer } from './keyboard/ShortcutLayer';
import { AppLayout } from './layout/AppLayout';
import { ForcedChangePinPage } from './pages/auth/ForcedChangePinPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RecoverPinPage } from './pages/auth/RecoverPinPage';
import { SetupPage } from './pages/auth/SetupPage';
import { CustomersLayout } from './pages/customers/CustomersLayout';
import { CustomersPage } from './pages/customers/CustomersPage';
import { LedgerPage } from './pages/customers/LedgerPage';
import { ReceivablesPage } from './pages/customers/ReceivablesPage';
import { HistoryPage } from './pages/history/HistoryPage';
import { KasirPage } from './pages/kasir/KasirPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ComingSoonPage } from './pages/PlaceholderPages';
import { CategoriesPage } from './pages/products/CategoriesPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { ProductListPage } from './pages/products/ProductListPage';
import { ProductsLayout } from './pages/products/ProductsLayout';
import { ChangePinPage } from './pages/settings/ChangePinPage';
import { SettingsIndex, SettingsLayout } from './pages/settings/SettingsLayout';
import { StoreSettingsPage } from './pages/settings/StoreSettingsPage';
import { UsersPage } from './pages/settings/UsersPage';

export const router = createBrowserRouter([
  { element: <RequireSetup />, children: [{ path: '/setup', element: <SetupPage /> }] },
  {
    element: <RequireAnonymous />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/pulihkan-pin', element: <RecoverPinPage /> },
    ],
  },
  {
    element: <RequirePendingPinChange />,
    children: [{ path: '/ubah-pin', element: <ForcedChangePinPage /> }],
  },
  {
    element: <RequireUser />,
    children: [
      {
        element: <ShortcutLayer />,
        children: [
          { index: true, element: <Navigate to="/kasir" replace /> },
          // Kasir is full screen; every other page uses the sidebar layout.
          { path: '/kasir', element: <KasirPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/riwayat', element: <HistoryPage /> },
              {
                path: '/barang',
                element: <ProductsLayout />,
                children: [
                  { index: true, element: <ProductListPage /> },
                  { path: 'kategori', element: <CategoriesPage /> },
                  { path: 'impor', element: <ComingSoonPage title="Impor barang" stage={9} /> },
                ],
              },
              { path: '/barang/baru', element: <ProductFormPage /> },
              { path: '/barang/:id', element: <ProductFormPage /> },
              { path: '/stok', element: <ComingSoonPage title="Stok" stage={7} /> },
              {
                path: '/pelanggan',
                element: <CustomersLayout />,
                children: [
                  { index: true, element: <CustomersPage /> },
                  { path: 'kartu', element: <LedgerPage /> },
                  { path: 'piutang', element: <ReceivablesPage /> },
                ],
              },
              { path: '/pemasok', element: <ComingSoonPage title="Pemasok" stage={7} /> },
              {
                path: '/laporan',
                element: (
                  <OwnerPinGate scope="laporan" title="Laporan">
                    <ComingSoonPage title="Laporan" stage={8} />
                  </OwnerPinGate>
                ),
              },
              {
                path: '/pengaturan',
                element: <SettingsLayout />,
                children: [
                  { index: true, element: <SettingsIndex /> },
                  {
                    path: 'pengguna',
                    element: (
                      <OwnerPinGate scope="pengguna" title="Pengguna">
                        <UsersPage />
                      </OwnerPinGate>
                    ),
                  },
                  {
                    path: 'toko',
                    element: (
                      <OwnerPinGate scope="profil-toko" title="Profil Toko">
                        <StoreSettingsPage />
                      </OwnerPinGate>
                    ),
                  },
                  { path: 'ubah-pin', element: <ChangePinPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
