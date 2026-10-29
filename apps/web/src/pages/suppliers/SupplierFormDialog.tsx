import type { Supplier } from '@toko-podomoro/shared';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { FormDialog } from '../../components/FormDialog';
import { TextField } from '../../components/forms';

/** Add or edit a supplier: name required, phone and note optional. */
export function SupplierFormDialog({
  supplier,
  onClose,
  onSaved,
}: {
  /** null = new supplier. */
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    note: supplier?.note ?? '',
  });
  return (
    <FormDialog
      open
      title={supplier ? 'Ubah pemasok' : 'Tambah pemasok'}
      submitLabel="Simpan"
      onClose={onClose}
      onSubmit={async () => {
        if (!form.name.trim()) return 'Nama pemasok wajib diisi.';
        try {
          const saved = supplier
            ? await api.updateSupplier(supplier.id, form)
            : await api.createSupplier(form);
          onSaved(saved.supplier);
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      }}
    >
      <TextField
        id="supplier-name"
        label="Nama"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        autoFocus
        autoComplete="off"
        uppercase
      />
      <TextField
        id="supplier-phone"
        label="No. HP (opsional)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        inputMode="tel"
        autoComplete="off"
      />
      <TextField
        id="supplier-note"
        label="Catatan (opsional)"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        autoComplete="off"
        uppercase
      />
    </FormDialog>
  );
}
