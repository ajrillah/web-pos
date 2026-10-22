import { describe, expect, it } from 'vitest';
import { menuFor, requiresOwnerPin } from './menu';

const labels = (role: 'owner' | 'cashier') =>
  menuFor(role).flatMap((s) =>
    s.items.map((i) => (i.requiresOwnerPin ? `${i.label} (PIN)` : i.label)),
  );

describe('menuFor', () => {
  it('gives owners every page without PIN markers', () => {
    expect(labels('owner')).toEqual([
      'Beranda',
      'Kasir',
      'Riwayat Transaksi',
      'Barang',
      'Stok',
      'Pelanggan',
      'Pemasok',
      'Laporan',
      'Pengguna',
      'Profil Toko',
      'Ubah PIN',
    ]);
  });

  it('marks reports, user management, and store settings as PIN-gated for cashiers', () => {
    expect(labels('cashier')).toEqual([
      'Beranda',
      'Kasir',
      'Riwayat Transaksi',
      'Barang',
      'Stok',
      'Pelanggan',
      'Pemasok',
      'Laporan (PIN)',
      'Pengguna (PIN)',
      'Profil Toko (PIN)',
      'Ubah PIN',
    ]);
  });

  it('groups settings under Pengaturan', () => {
    expect(menuFor('owner').map((s) => s.title)).toEqual([undefined, 'Pengaturan']);
  });
});

describe('requiresOwnerPin', () => {
  it('applies only to cashiers on gated pages', () => {
    expect(requiresOwnerPin('cashier', '/pengaturan/pengguna')).toBe(true);
    expect(requiresOwnerPin('owner', '/pengaturan/pengguna')).toBe(false);
    expect(requiresOwnerPin('cashier', '/pengaturan/ubah-pin')).toBe(false);
  });
});
