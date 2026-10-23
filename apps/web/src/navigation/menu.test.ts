import { describe, expect, it } from 'vitest';
import {
  customerTabsFor,
  type MenuItem,
  menuFor,
  productTabsFor,
  requiresOwnerPin,
  settingsHomeFor,
  settingsTabsFor,
  stockTabsFor,
  supplierTabsFor,
} from './menu';

const labels = (items: MenuItem[]) =>
  items.map((i) => (i.requiresOwnerPin ? `${i.label} (PIN)` : i.label));

describe('menuFor', () => {
  it('gives owners the 8 sidebar items without PIN markers', () => {
    expect(labels(menuFor('owner'))).toEqual([
      'Kasir',
      'Riwayat',
      'Barang',
      'Stok',
      'Pelanggan',
      'Pemasok',
      'Laporan',
      'Pengaturan',
    ]);
  });

  it('marks reports as PIN-gated for cashiers', () => {
    expect(labels(menuFor('cashier'))).toEqual([
      'Kasir',
      'Riwayat',
      'Barang',
      'Stok',
      'Pelanggan',
      'Pemasok',
      'Laporan (PIN)',
      'Pengaturan',
    ]);
  });

  it('shows the function-key hints from the shortcut table', () => {
    expect(menuFor('owner').map((i) => i.shortcut ?? null)).toEqual([
      'F1',
      'F6',
      'F3',
      'F4',
      'F5',
      null,
      null,
      null,
    ]);
  });
});

describe('settingsTabsFor', () => {
  it('marks user management and store settings as PIN-gated for cashiers', () => {
    expect(labels(settingsTabsFor('owner'))).toEqual([
      'Pengguna',
      'Profil Toko',
      'Ubah PIN',
      'Cadangan Data',
    ]);
    expect(labels(settingsTabsFor('cashier'))).toEqual([
      'Pengguna (PIN)',
      'Profil Toko (PIN)',
      'Ubah PIN',
    ]);
  });

  it('opens Pengaturan on the first tab the role can use', () => {
    expect(settingsHomeFor('owner')).toBe('/pengaturan/pengguna');
    expect(settingsHomeFor('cashier')).toBe('/pengaturan/ubah-pin');
  });
});

describe('productTabsFor', () => {
  it('lists the Barang sub-pages; Impor needs the owner PIN for cashiers', () => {
    expect(labels(productTabsFor('cashier'))).toEqual(['Daftar', 'Kategori', 'Impor (PIN)']);
    expect(labels(productTabsFor('owner'))).toEqual(['Daftar', 'Kategori', 'Impor']);
  });
});

describe('customerTabsFor', () => {
  it('lists the Pelanggan sub-pages, open to cashiers', () => {
    expect(labels(customerTabsFor('cashier'))).toEqual([
      'Daftar',
      'Kartu Piutang',
      'Daftar Piutang',
    ]);
  });
});

describe('stockTabsFor and supplierTabsFor', () => {
  it('lists the Stok and Pemasok sub-pages, open to cashiers', () => {
    expect(labels(stockTabsFor('cashier'))).toEqual([
      'Stok Masuk',
      'Penyesuaian',
      'Opname',
      'Riwayat',
    ]);
    expect(stockTabsFor('cashier').some((t) => t.requiresOwnerPin)).toBe(false);
    expect(labels(supplierTabsFor('cashier'))).toEqual(['Daftar', 'Kartu Hutang', 'Daftar Hutang']);
  });
});

describe('requiresOwnerPin', () => {
  it('applies only to cashiers on gated pages', () => {
    expect(requiresOwnerPin('cashier', '/pengaturan/pengguna')).toBe(true);
    expect(requiresOwnerPin('owner', '/pengaturan/pengguna')).toBe(false);
    expect(requiresOwnerPin('cashier', '/pengaturan/ubah-pin')).toBe(false);
    expect(requiresOwnerPin('cashier', '/laporan')).toBe(true);
    expect(requiresOwnerPin('cashier', '/barang/impor')).toBe(true);
    expect(requiresOwnerPin('owner', '/barang/impor')).toBe(false);
  });
});
