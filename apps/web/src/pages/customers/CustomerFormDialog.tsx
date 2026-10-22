import type { Customer } from '@toko-podomoro/shared';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { FormDialog } from '../../components/FormDialog';
import { TextField } from '../../components/forms';

/** Add or edit a customer: name required, phone and note optional. */
export function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
}: {
  /** null = new customer. */
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    note: customer?.note ?? '',
  });
  return (
    <FormDialog
      open
      title={customer ? 'Ubah pelanggan' : 'Tambah pelanggan'}
      submitLabel="Simpan"
      onClose={onClose}
      onSubmit={async () => {
        if (!form.name.trim()) return 'Nama pelanggan wajib diisi.';
        try {
          const saved = customer
            ? await api.updateCustomer(customer.id, form)
            : await api.createCustomer(form);
          onSaved(saved.customer);
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      }}
    >
      <TextField
        id="customer-name"
        label="Nama"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        autoFocus
        autoComplete="off"
      />
      <TextField
        id="customer-phone"
        label="No. HP (opsional)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        inputMode="tel"
        autoComplete="off"
      />
      <TextField
        id="customer-note"
        label="Catatan (opsional)"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        autoComplete="off"
      />
    </FormDialog>
  );
}
