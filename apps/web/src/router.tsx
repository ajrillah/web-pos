import { lazy } from 'react';
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
import { KasirPage } from './pages/kasir/KasirPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Pages load on first visit (code splitting). Auth pages and Kasir stay in the main bundle.
const CustomersLayout = lazy(() =>
  import('./pages/customers/CustomersLayout').then((m) => ({ default: m.CustomersLayout })),
);
const CustomersPage = lazy(() =>
  import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const LedgerPage = lazy(() =>
  import('./pages/customers/LedgerPage').then((m) => ({ default: m.LedgerPage })),
);
const ReceivablesPage = lazy(() =>
  import('./pages/customers/ReceivablesPage').then((m) => ({ default: m.ReceivablesPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/history/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const CategoriesPage = lazy(() =>
  import('./pages/products/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
);
const ImportPage = lazy(() =>
  import('./pages/products/ImportPage').then((m) => ({ default: m.ImportPage })),
);
const ProductFormPage = lazy(() =>
  import('./pages/products/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
);
const ProductListPage = lazy(() =>
  import('./pages/products/ProductListPage').then((m) => ({ default: m.ProductListPage })),
);
const ProductsLayout = lazy(() =>
  import('./pages/products/ProductsLayout').then((m) => ({ default: m.ProductsLayout })),
);
const ReportsPage = lazy(() =>
  import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const BackupPage = lazy(() =>
  import('./pages/settings/BackupPage').then((m) => ({ default: m.BackupPage })),
);
const ChangePinPage = lazy(() =>
  import('./pages/settings/ChangePinPage').then((m) => ({ default: m.ChangePinPage })),
);
const OwnerOnly = lazy(() =>
  import('./pages/settings/SettingsLayout').then((m) => ({ default: m.OwnerOnly })),
);
const SettingsIndex = lazy(() =>
  import('./pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsIndex })),
);
const SettingsLayout = lazy(() =>
  import('./pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })),
);
const StoreSettingsPage = lazy(() =>
  import('./pages/settings/StoreSettingsPage').then((m) => ({ default: m.StoreSettingsPage })),
);
const UsersPage = lazy(() =>
  import('./pages/settings/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const AdjustmentsPage = lazy(() =>
  import('./pages/stock/AdjustmentsPage').then((m) => ({ default: m.AdjustmentsPage })),
);
const MovementsPage = lazy(() =>
  import('./pages/stock/MovementsPage').then((m) => ({ default: m.MovementsPage })),
);
const OpnameListPage = lazy(() =>
  import('./pages/stock/OpnameListPage').then((m) => ({ default: m.OpnameListPage })),
);
const OpnameSessionPage = lazy(() =>
  import('./pages/stock/OpnameSessionPage').then((m) => ({ default: m.OpnameSessionPage })),
);
const PurchaseFormPage = lazy(() =>
  import('./pages/stock/PurchaseFormPage').then((m) => ({ default: m.PurchaseFormPage })),
);
const PurchasesPage = lazy(() =>
  import('./pages/stock/PurchasesPage').then((m) => ({ default: m.PurchasesPage })),
);
const StockLayout = lazy(() =>
  import('./pages/stock/StockLayout').then((m) => ({ default: m.StockLayout })),
);
const PayablesPage = lazy(() =>
  import('./pages/suppliers/PayablesPage').then((m) => ({ default: m.PayablesPage })),
);
const SupplierLedgerPage = lazy(() =>
  import('./pages/suppliers/SupplierLedgerPage').then((m) => ({ default: m.SupplierLedgerPage })),
);
const SuppliersLayout = lazy(() =>
  import('./pages/suppliers/SuppliersLayout').then((m) => ({ default: m.SuppliersLayout })),
);
const SuppliersPage = lazy(() =>
  import('./pages/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);

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
                  {
                    path: 'impor',
                    element: (
                      <OwnerPinGate scope="impor" title="Impor barang">
                        <ImportPage />
                      </OwnerPinGate>
                    ),
                  },
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
                  {
                    path: 'data',
                    element: (
                      <OwnerOnly>
                        <BackupPage />
                      </OwnerOnly>
                    ),
                  },
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
