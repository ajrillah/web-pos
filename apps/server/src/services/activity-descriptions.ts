import { APPROVAL_SCOPE_LABELS, type ApprovalScope, formatRupiah } from '@toko-podomoro/shared';

// One Indonesian line per audit row for the activity report (docs/design.md 4.7).

const ENTITY_LABELS: Record<string, string> = {
  user: 'pengguna',
  category: 'kategori',
  customer: 'pelanggan',
  supplier: 'pemasok',
  product: 'barang',
  product_unit: 'satuan barang',
  setting: 'pengaturan',
  sale: 'transaksi',
  customer_payment: 'pembayaran kasbon',
  purchase: 'stok masuk',
  supplier_payment: 'pembayaran hutang',
  held_sale: 'transaksi ditahan',
};

const VERBS: Record<string, string> = {
  create: 'Tambah',
  update: 'Ubah',
  activate: 'Aktifkan',
  deactivate: 'Nonaktifkan',
};

const SETTING_LABELS: Record<string, string> = {
  store_name: 'nama toko',
  store_address: 'alamat toko',
  store_phone: 'telepon toko',
  receipt_footer: 'catatan kaki nota',
  rounding: 'pembulatan',
  receipt_width: 'lebar nota',
  receipt_folder: 'folder nota',
  auto_lock_minutes: 'kunci otomatis (menit)',
};

const PIN_CONTEXTS: Record<string, string> = {
  login: 'saat masuk',
  unlock: 'saat membuka kunci',
  approve: 'pada persetujuan pemilik',
};

const scopeLabel = (scope: unknown) =>
  APPROVAL_SCOPE_LABELS[scope as ApprovalScope] ?? String(scope ?? '');

function parse(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const field = (value: unknown, key: string): unknown =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

export interface AuditInput {
  entity: string;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
}

/** Describes an audit row; `names` maps record ids to numbers or names. */
export function describeAudit(row: AuditInput, names: Map<string, string>): string {
  const oldValue = parse(row.oldValue);
  const newValue = parse(row.newValue);
  const label = ENTITY_LABELS[row.entity] ?? row.entity;
  const name =
    names.get(row.entityId) ??
    (field(oldValue, 'number') as string | undefined) ??
    (field(newValue, 'name') as string | undefined) ??
    (field(oldValue, 'name') as string | undefined) ??
    '';
  const named = (text: string) => (name ? `${text} ${name}` : text);

  if (row.action === 'void') {
    const reason = field(newValue, 'reason');
    return `${named(`Batal ${label}`)}${reason ? `: ${reason}` : ''}`;
  }
  if (row.entity === 'auth' && row.action === 'failed_pin') {
    const context = field(newValue, 'context') as string;
    const scope = field(newValue, 'scope');
    const who = names.get(row.entityId);
    return `PIN salah ${PIN_CONTEXTS[context] ?? ''}${scope ? ` (${scopeLabel(scope)})` : ''}${who ? ` untuk ${who}` : ''}`.trim();
  }
  if (row.entity === 'approval' && row.action === 'grant') {
    const target = names.get(row.entityId);
    return `Persetujuan pemilik untuk ${scopeLabel(field(newValue, 'scope'))}${target ? ` (${target})` : ''}`;
  }
  if (row.action === 'cost_from_purchase') {
    const purchase = names.get(String(field(newValue, 'purchaseId') ?? ''));
    return `${named('Harga modal')} ${formatRupiah(Number(field(oldValue, 'costPrice')))} ke ${formatRupiah(Number(field(newValue, 'costPrice')))}${purchase ? ` dari ${purchase}` : ''}`;
  }
  if (row.entity === 'setting') {
    return `Ubah ${SETTING_LABELS[row.entityId] ?? row.entityId}: ${String(oldValue ?? '—')} ke ${String(newValue ?? '—')}`;
  }
  if (row.entity === 'held_sale') {
    return row.action === 'auto_delete'
      ? 'Hapus otomatis transaksi ditahan (lebih dari 7 hari)'
      : 'Hapus transaksi ditahan';
  }
  if (row.entity === 'user') {
    const userActions: Record<string, string> = {
      setup: 'Pengaturan awal: pemilik',
      change_pin: 'Ganti PIN',
      recover_pin: 'Pulihkan PIN',
      reset_pin: 'Atur ulang PIN',
    };
    if (userActions[row.action]) return named(userActions[row.action] as string);
  }
  const verb = VERBS[row.action];
  return verb ? named(`${verb} ${label}`) : named(`${label} ${row.action}`);
}
