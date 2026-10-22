import type { Role } from '@toko-podomoro/shared';

export interface MenuItem {
  label: string;
  path: string;
  /** Function-key hint shown next to the item (wired in Stage 3; see docs/design.md section 8). */
  shortcut?: string;
  /** Cashiers need owner approval (PIN) to open this page. */
  requiresOwnerPin: boolean;
}

interface MenuEntry {
  label: string;
  path: string;
  shortcut?: string;
  ownerPin?: boolean;
}

// Sidebar per docs/ui-style.md section 5 (8 items). Kasir moves to its own full-screen layout in Stage 3.
const sidebar: MenuEntry[] = [
  { label: 'Kasir', path: '/kasir', shortcut: 'F1' },
  { label: 'Riwayat', path: '/riwayat', shortcut: 'F6' },
  { label: 'Barang', path: '/barang', shortcut: 'F3' },
  { label: 'Stok', path: '/stok', shortcut: 'F4' },
  { label: 'Pelanggan', path: '/pelanggan', shortcut: 'F5' },
  { label: 'Pemasok', path: '/pemasok' },
  { label: 'Laporan', path: '/laporan', ownerPin: true },
  { label: 'Pengaturan', path: '/pengaturan' },
];

// Sub-pages of Pengaturan, shown as tabs above the content.
const settingsTabs: MenuEntry[] = [
  { label: 'Pengguna', path: '/pengaturan/pengguna', ownerPin: true },
  { label: 'Profil Toko', path: '/pengaturan/toko', ownerPin: true },
  { label: 'Ubah PIN', path: '/pengaturan/ubah-pin' },
];

// Sub-pages of Barang. Kategori is readable by everyone; changing categories needs owner PIN.
// Impor is a PIN menu.
const productTabs: MenuEntry[] = [
  { label: 'Daftar', path: '/barang' },
  { label: 'Kategori', path: '/barang/kategori' },
  { label: 'Impor', path: '/barang/impor', ownerPin: true },
];

// Sub-pages of Pelanggan.
const customerTabs: MenuEntry[] = [
  { label: 'Daftar', path: '/pelanggan' },
  { label: 'Kartu Piutang', path: '/pelanggan/kartu' },
  { label: 'Daftar Piutang', path: '/pelanggan/piutang' },
];

// Sub-pages of Stok.
const stockTabs: MenuEntry[] = [
  { label: 'Stok Masuk', path: '/stok' },
  { label: 'Penyesuaian', path: '/stok/penyesuaian' },
  { label: 'Opname', path: '/stok/opname' },
  { label: 'Riwayat', path: '/stok/riwayat' },
];

// Sub-pages of Pemasok.
const supplierTabs: MenuEntry[] = [
  { label: 'Daftar', path: '/pemasok' },
  { label: 'Kartu Hutang', path: '/pemasok/kartu' },
  { label: 'Daftar Hutang', path: '/pemasok/hutang' },
];

function forRole(entries: MenuEntry[], role: Role): MenuItem[] {
  return entries.map(({ ownerPin = false, ...entry }) => ({
    ...entry,
    requiresOwnerPin: ownerPin && role === 'cashier',
  }));
}

/** Sidebar menu for a role: owners open everything directly; cashiers see PIN-gated items marked. */
export function menuFor(role: Role): MenuItem[] {
  return forRole(sidebar, role);
}

/** Pengaturan tabs for a role, marked like the sidebar. */
export function settingsTabsFor(role: Role): MenuItem[] {
  return forRole(settingsTabs, role);
}

/** Barang tabs for a role, marked like the sidebar. */
export function productTabsFor(role: Role): MenuItem[] {
  return forRole(productTabs, role);
}

/** Pelanggan tabs (open to every role). */
export function customerTabsFor(role: Role): MenuItem[] {
  return forRole(customerTabs, role);
}

/** Stok tabs (open to every role; voids ask for the owner PIN). */
export function stockTabsFor(role: Role): MenuItem[] {
  return forRole(stockTabs, role);
}

/** Pemasok tabs (open to every role; voids ask for the owner PIN). */
export function supplierTabsFor(role: Role): MenuItem[] {
  return forRole(supplierTabs, role);
}

/** First Pengaturan tab a role can open without approval. */
export function settingsHomeFor(role: Role): string {
  return settingsTabsFor(role).find((tab) => !tab.requiresOwnerPin)?.path ?? '/pengaturan/ubah-pin';
}

/** Whether this role needs owner approval for the page at `path`. */
export function requiresOwnerPin(role: Role, path: string): boolean {
  return [...menuFor(role), ...settingsTabsFor(role), ...productTabsFor(role)].some(
    (item) => item.path === path && item.requiresOwnerPin,
  );
}

export const roleLabels: Record<Role, string> = { owner: 'Pemilik', cashier: 'Kasir' };
