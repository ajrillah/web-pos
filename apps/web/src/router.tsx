import { createBrowserRouter, Navigate } from 'react-router';
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
import { HistoryPage } from './pages/history/HistoryPage';
import { KasirPage } from './pages/kasir/KasirPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ComingSoonPage, OwnerPinGate } from './pages/PlaceholderPages';
import { CategoriesPage } from './pages/products/CategoriesPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { ProductListPage } from './pages/products/ProductListPage';
import { ProductsLayout } from './pages/products/ProductsLayout';
import { ChangePinPage } from './pages/settings/ChangePinPage';
import { SettingsIndex, SettingsLayout } from './pages/settings/SettingsLayout';
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
              { path: '/pelanggan', element: <ComingSoonPage title="Pelanggan" stage={4} /> },
              { path: '/pemasok', element: <ComingSoonPage title="Pemasok" stage={7} /> },
              {
                path: '/laporan',
                element: (
                  <OwnerPinGate title="Laporan">
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
                      <OwnerPinGate title="Pengguna">
                        <UsersPage />
                      </OwnerPinGate>
                    ),
                  },
                  {
                    path: 'toko',
                    element: (
                      <OwnerPinGate title="Profil Toko">
                        <ComingSoonPage title="Profil Toko" stage={5} />
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
