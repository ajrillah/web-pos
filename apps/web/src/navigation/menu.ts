import type { Role } from '@toko-podomoro/shared';

export interface MenuItem {
  label: string;
  path: string;
  /** Cashiers need owner approval (PIN) to open this page. */
  requiresOwnerPin: boolean;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

interface MenuEntry {
  label: string;
  path: string;
  ownerPin?: boolean;
}

// Pages per docs/design.md section 7. Kasir moves to its own full-screen layout in Stage 3.
const sections: { title?: string; entries: MenuEntry[] }[] = [
  {
    entries: [
      { label: 'Beranda', path: '/' },
      { label: 'Kasir', path: '/kasir' },
      { label: 'Riwayat Transaksi', path: '/riwayat' },
      { label: 'Barang', path: '/barang' },
      { label: 'Stok', path: '/stok' },
      { label: 'Pelanggan', path: '/pelanggan' },
      { label: 'Pemasok', path: '/pemasok' },
      { label: 'Laporan', path: '/laporan', ownerPin: true },
    ],
  },
  {
    title: 'Pengaturan',
    entries: [
      { label: 'Pengguna', path: '/pengaturan/pengguna', ownerPin: true },
      { label: 'Profil Toko', path: '/pengaturan/toko', ownerPin: true },
      { label: 'Ubah PIN', path: '/pengaturan/ubah-pin' },
    ],
  },
];

/** Sidebar menu for a role: owners open everything directly; cashiers see PIN-gated items marked. */
export function menuFor(role: Role): MenuSection[] {
  return sections.map(({ title, entries }) => ({
    ...(title ? { title } : {}),
    items: entries.map(({ label, path, ownerPin = false }) => ({
      label,
      path,
      requiresOwnerPin: ownerPin && role === 'cashier',
    })),
  }));
}

/** Whether this role needs owner approval for the page at `path`. */
export function requiresOwnerPin(role: Role, path: string): boolean {
  return menuFor(role).some((s) => s.items.some((i) => i.path === path && i.requiresOwnerPin));
}

export const roleLabels: Record<Role, string> = { owner: 'Pemilik', cashier: 'Kasir' };
