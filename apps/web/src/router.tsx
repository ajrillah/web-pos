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
import { ReportsPage } from './pages/reports/ReportsPage';
import { ChangePinPage } from './pages/settings/ChangePinPage';
import { SettingsIndex, SettingsLayout } from './pages/settings/SettingsLayout';
import { StoreSettingsPage } from './pages/settings/StoreSettingsPage';
import { UsersPage } from './pages/settings/UsersPage';
import { AdjustmentsPage } from './pages/stock/AdjustmentsPage';
import { MovementsPage } from './pages/stock/MovementsPage';
import { OpnameListPage } from './pages/stock/OpnameListPage';
import { OpnameSessionPage } from './pages/stock/OpnameSessionPage';
import { PurchaseFormPage } from './pages/stock/PurchaseFormPage';
import { PurchasesPage } from './pages/stock/PurchasesPage';
import { StockLayout } from './pages/stock/StockLayout';
import { PayablesPage } from './pages/suppliers/PayablesPage';
import { SupplierLedgerPage } from './pages/suppliers/SupplierLedgerPage';
import { SuppliersLayout } from './pages/suppliers/SuppliersLayout';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';

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
              {
                path: '/stok',
                element: <StockLayout />,
                children: [
                  { index: true, element: <PurchasesPage /> },
                  { path: 'penyesuaian', element: <AdjustmentsPage /> },
                  { path: 'opname', element: <OpnameListPage /> },
                  { path: 'riwayat', element: <MovementsPage /> },
                ],
              },
              { path: '/stok/masuk/baru', element: <PurchaseFormPage /> },
              { path: '/stok/opname/:id', element: <OpnameSessionPage /> },
              {
                path: '/pelanggan',
                element: <CustomersLayout />,
                children: [
                  { index: true, element: <CustomersPage /> },
                  { path: 'kartu', element: <LedgerPage /> },
                  { path: 'piutang', element: <ReceivablesPage /> },
                ],
              },
              {
                path: '/pemasok',
                element: <SuppliersLayout />,
                children: [
                  { index: true, element: <SuppliersPage /> },
                  { path: 'kartu', element: <SupplierLedgerPage /> },
                  { path: 'hutang', element: <PayablesPage /> },
                ],
              },
              {
                path: '/laporan',
                element: (
                  <OwnerPinGate scope="laporan" title="Laporan">
                    <ReportsPage />
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
