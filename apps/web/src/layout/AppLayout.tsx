import { NavLink, Outlet } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthProvider';
import { menuFor, roleLabels } from '../navigation/menu';

/** Sidebar layout used by every page except Kasir. The menu depends on the user's role. */
export function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-100">
        <div className="px-4 py-5 text-lg font-bold tracking-wide">TOKO PODOMORO</div>
        <nav className="flex-1 space-y-4" aria-label="Menu utama">
          {menuFor(user.role).map((section) => (
            <div key={section.title ?? 'main'}>
              {section.title && (
                <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `flex items-center justify-between px-4 py-2 ${
                      isActive ? 'bg-slate-700 font-semibold' : 'hover:bg-slate-800'
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {item.requiresOwnerPin && (
                    <span
                      title="Perlu PIN pemilik"
                      className="rounded bg-amber-500 px-1.5 text-xs font-bold text-slate-900"
                    >
                      PIN
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-slate-700 px-4 py-4">
          <div data-testid="current-user">
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm text-slate-400">
              {roleLabels[user.role]} · {user.username}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded bg-slate-700 px-3 py-1.5 text-left hover:bg-slate-600"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
