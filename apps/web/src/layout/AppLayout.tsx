import { NavLink, Outlet } from 'react-router';

/** Sidebar layout used by every page except Kasir. Menu items are added per stage. */
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100">
        <div className="px-4 py-5 text-lg font-bold tracking-wide">TOKO PODOMORO</div>
        <nav className="flex flex-col">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-4 py-2 ${isActive ? 'bg-slate-700 font-semibold' : 'hover:bg-slate-800'}`
            }
          >
            Beranda
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
