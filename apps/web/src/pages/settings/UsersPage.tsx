import type { Role, User } from '@toko-podomoro/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useCurrentUser } from '../../auth/AuthProvider';
import {
  checkPin,
  checkUsername,
  ErrorAlert,
  fieldMessages,
  PinField,
  TextField,
} from '../../components/forms';
import { roleLabels } from '../../navigation/menu';

type RowAction = { kind: 'rename' | 'resetPin'; userId: string } | null;

const smallButton =
  'rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-40';

/** Owner-only user management: create, rename, (de)activate, and reset cashier PINs. */
export function UsersPage() {
  const me = useCurrentUser();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<RowAction>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api.listUsers()).users);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(task: () => Promise<unknown>, success: string) {
    setError(null);
    setNotice(null);
    try {
      await task();
      setNotice(success);
      setAction(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Pengguna</h1>
      <ErrorAlert message={error} />
      {notice && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-800"
        >
          {notice}
        </p>
      )}

      <table className="w-full overflow-hidden rounded bg-white text-left shadow">
        <thead className="bg-slate-200 text-sm text-slate-700">
          <tr>
            <th className="px-3 py-2">Nama</th>
            <th className="px-3 py-2">Nama pengguna</th>
            <th className="px-3 py-2">Peran</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === me.id}
              action={action?.userId === user.id ? action.kind : null}
              onAction={(kind) => setAction(kind ? { kind, userId: user.id } : null)}
              run={run}
            />
          ))}
        </tbody>
      </table>
      {users === null && !error && <p>Memuat…</p>}

      <CreateUserForm
        onCreate={(input) =>
          run(
            () => api.createUser(input),
            `Pengguna ${input.username} dibuat. PIN sementara harus diganti saat pertama masuk.`,
          )
        }
      />
    </section>
  );
}

function UserRow({
  user,
  isSelf,
  action,
  onAction,
  run,
}: {
  user: User;
  isSelf: boolean;
  action: 'rename' | 'resetPin' | null;
  onAction: (kind: 'rename' | 'resetPin' | null) => void;
  run: (task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  function open(kind: 'rename' | 'resetPin') {
    setValue(kind === 'rename' ? user.name : '');
    setConfirm('');
    setLocalError(null);
    onAction(action === kind ? null : kind);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (action === 'rename') {
      if (!value.trim()) return setLocalError(fieldMessages.name);
      void run(() => api.updateUser(user.id, { name: value }), 'Nama pengguna diperbarui.');
    } else if (action === 'resetPin') {
      const problem = checkPin(value, confirm);
      if (problem) return setLocalError(problem);
      void run(
        () => api.updateUser(user.id, { pin: value }),
        `PIN ${user.name} diatur ulang. PIN sementara harus diganti saat masuk.`,
      );
    }
  }

  const toggleActive = () =>
    void run(
      () => api.updateUser(user.id, { active: !user.active }),
      user.active ? `${user.name} dinonaktifkan.` : `${user.name} diaktifkan kembali.`,
    );

  return (
    <>
      <tr className="border-t border-slate-200" data-username={user.username}>
        <td className="px-3 py-2 font-medium">
          {user.name}
          {isSelf && <span className="ml-2 text-sm text-slate-500">(Anda)</span>}
        </td>
        <td className="px-3 py-2 font-mono text-sm">{user.username}</td>
        <td className="px-3 py-2">{roleLabels[user.role]}</td>
        <td className="px-3 py-2">
          {user.active ? (
            user.mustChangePin ? (
              <span className="text-amber-700">Aktif · PIN sementara</span>
            ) : (
              <span className="text-green-700">Aktif</span>
            )
          ) : (
            <span className="text-slate-500">Nonaktif</span>
          )}
        </td>
        <td className="space-x-2 px-3 py-2 whitespace-nowrap">
          <button type="button" className={smallButton} onClick={() => open('rename')}>
            Ubah nama
          </button>
          {user.role === 'cashier' && (
            <button type="button" className={smallButton} onClick={() => open('resetPin')}>
              Atur ulang PIN
            </button>
          )}
          <button
            type="button"
            className={smallButton}
            onClick={toggleActive}
            disabled={isSelf}
            title={isSelf ? 'Anda tidak dapat menonaktifkan akun sendiri.' : undefined}
          >
            {user.active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </td>
      </tr>
      {action && (
        <tr className="bg-slate-50">
          <td colSpan={5} className="px-3 py-3">
            <form onSubmit={submit} className="flex items-end gap-3" noValidate>
              {action === 'rename' ? (
                <TextField
                  id={`rename-${user.id}`}
                  label="Nama"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              ) : (
                <>
                  <PinField
                    id={`pin-${user.id}`}
                    label="PIN sementara"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                  />
                  <PinField
                    id={`pin-confirm-${user.id}`}
                    label="Ulangi PIN"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </>
              )}
              <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
                Simpan
              </button>
              <button type="button" className={smallButton} onClick={() => onAction(null)}>
                Batal
              </button>
            </form>
            {localError && <p className="mt-2 text-red-700">{localError}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function CreateUserForm({
  onCreate,
}: {
  onCreate: (input: { name: string; username: string; role: Role; pin: string }) => Promise<void>;
}) {
  const empty = { name: '', username: '', role: 'cashier' as Role, pin: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem =
      (form.name.trim() ? null : fieldMessages.name) ??
      checkUsername(form.username) ??
      checkPin(form.pin, form.confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    await onCreate({ name: form.name, username: form.username, role: form.role, pin: form.pin });
    setForm(empty);
  }

  const set =
    (key: 'name' | 'username' | 'pin' | 'confirm') => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value });

  return (
    <form onSubmit={submit} className="max-w-md space-y-4 rounded bg-white p-5 shadow" noValidate>
      <h2 className="text-lg font-bold">Tambah pengguna</h2>
      <TextField id="new-name" label="Nama" value={form.name} onChange={set('name')} />
      <TextField
        id="new-username"
        label="Nama pengguna"
        value={form.username}
        onChange={set('username')}
        autoCapitalize="none"
      />
      <label htmlFor="new-role" className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Peran</span>
        <select
          id="new-role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-lg"
        >
          <option value="cashier">Kasir</option>
          <option value="owner">Pemilik</option>
        </select>
      </label>
      <PinField
        id="new-pin"
        label="PIN sementara (6 angka)"
        value={form.pin}
        onChange={set('pin')}
      />
      <PinField
        id="new-confirm"
        label="Ulangi PIN"
        value={form.confirm}
        onChange={set('confirm')}
      />
      <p className="text-sm text-slate-600">
        Pengguna baru wajib mengganti PIN sementara saat pertama kali masuk.
      </p>
      <ErrorAlert message={error} />
      <button
        type="submit"
        className="w-full rounded bg-slate-900 px-4 py-2 text-lg font-semibold text-white hover:bg-slate-700"
      >
        Tambah pengguna
      </button>
    </form>
  );
}
