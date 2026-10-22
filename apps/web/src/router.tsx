import { createBrowserRouter } from 'react-router';
import {
  RequireAnonymous,
  RequirePendingPinChange,
  RequireSetup,
  RequireUser,
} from './auth/guards';
import { AppLayout } from './layout/AppLayout';
import { ForcedChangePinPage } from './pages/auth/ForcedChangePinPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RecoverPinPage } from './pages/auth/RecoverPinPage';
import { SetupPage } from './pages/auth/SetupPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ComingSoonPage, OwnerPinGate } from './pages/PlaceholderPages';
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
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '/kasir', element: <ComingSoonPage title="Kasir" stage={3} /> },
          { path: '/riwayat', element: <ComingSoonPage title="Riwayat Transaksi" stage={3} /> },
          { path: '/barang', element: <ComingSoonPage title="Barang" stage={2} /> },
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
]);
