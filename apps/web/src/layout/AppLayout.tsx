import {
  Boxes,
  ChartColumn,
  Lock,
  LogOut,
  type LucideIcon,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';
import { PinHint } from '../components/PinHint';
import { Button } from '../components/ui/button';
import { Kbd } from '../components/ui/kbd';
import { cn } from '../lib/utils';
import { menuFor, roleLabels } from '../navigation/menu';

const icons: Record<string, LucideIcon> = {
  '/kasir': ShoppingCart,
  '/riwayat': ReceiptText,
  '/barang': Package,
  '/stok': Boxes,
  '/pelanggan': Users,
  '/pemasok': Truck,
  '/laporan': ChartColumn,
  '/pengaturan': Settings,
};

/** Sidebar layout (232px) used by every page except Kasir. The menu depends on the user's role. */
export function AppLayout() {
  const user = useCurrentUser();
  const { lock, logout } = useAuth();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col gap-6 px-4 py-6">
        <NavLink
          to="/"
          className="rounded-control px-2 outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft"
        >
          <BrandMark compact />
        </NavLink>
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Menu utama">
          {menuFor(user.role).map((item) => {
            const Icon = icons[item.path] ?? Settings;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-row px-3 font-semibold outline-none transition-colors',
                    'focus-visible:ring-[3px] focus-visible:ring-primary-soft',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="size-[19px]" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.requiresOwnerPin ? (
                  <PinHint />
                ) : (
                  item.shortcut && <Kbd className="text-muted-foreground">{item.shortcut}</Kbd>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-3 rounded-card bg-card p-4 shadow-card">
          <div data-testid="current-user" className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary"
            >
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.name}</div>
              <div className="truncate text-sm text-muted-foreground">
                {roleLabels[user.role]} · <span className="font-mono">{user.username}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => void lock()} title="Ctrl+L">
              <Lock className="size-4" aria-hidden />
              Kunci
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut className="size-4" aria-hidden />
              Keluar
            </Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-7">
        {/* Pages are loaded on first visit (router.tsx). */}
        <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
