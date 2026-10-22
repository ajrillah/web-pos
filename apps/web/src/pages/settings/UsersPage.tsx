import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import type { Role, User } from '@toko-podomoro/shared';
import { KeyRound, Pencil, Power, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useCurrentUser } from '../../auth/AuthProvider';
import { FormDialog } from '../../components/FormDialog';
import {
  checkPin,
  checkUsername,
  ErrorAlert,
  fieldMessages,
  PinField,
  TextField,
} from '../../components/forms';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { PageHeader } from '../../layout/PageHeader';
import { cn } from '../../lib/utils';
import { roleLabels } from '../../navigation/menu';

type OpenDialog = { kind: 'create' } | { kind: 'rename' | 'resetPin'; user: User } | null;

/** Runs a mutation; on success shows a toast and reloads. Errors are thrown to the caller. */
type Run = (task: () => Promise<unknown>, success: string) => Promise<void>;

const features = tableFeatures({});
const column = createColumnHelper<typeof features, User>();

/** Owner-only user management: create, rename, (de)activate, and reset cashier PINs. */
export function UsersPage() {
  const me = useCurrentUser();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

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

  const run = useCallback<Run>(
    async (task, success) => {
      await task();
      toast.success(success);
      setDialog(null);
      setError(null);
      await load();
    },
    [load],
  );

  const toggleActive = useCallback(
    (user: User) =>
      run(
        () => api.updateUser(user.id, { active: !user.active }),
        user.active ? `${user.name} dinonaktifkan.` : `${user.name} diaktifkan kembali.`,
      ).catch((err: unknown) => setError(errorMessage(err))),
    [run],
  );

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('name', {
          header: 'Nama',
          cell: ({ row }) => (
            <div className="leading-snug">
              <div className="font-semibold">
                {row.original.name}
                {row.original.id === me.id && (
                  <span className="ml-2 text-[15px] font-normal text-muted-foreground">(Anda)</span>
                )}
              </div>
              <div className="font-mono text-sm text-muted-foreground">{row.original.username}</div>
            </div>
          ),
        }),
        column.accessor('role', {
          header: 'Peran',
          cell: ({ getValue }) => roleLabels[getValue()],
        }),
        column.display({
          id: 'status',
          header: 'Status',
          cell: ({ row }) => <UserStatus user={row.original} />,
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">Aksi</span>,
          cell: ({ row }) => (
            <UserActions
              user={row.original}
              isSelf={row.original.id === me.id}
              onRename={() => setDialog({ kind: 'rename', user: row.original })}
              onResetPin={() => setDialog({ kind: 'resetPin', user: row.original })}
              onToggleActive={() => void toggleActive(row.original)}
            />
          ),
        }),
      ]),
    [me.id, toggleActive],
  );

  const data = useMemo(() => users ?? [], [users]);
  const table = useTable({ features, columns, data, getRowId: (user) => user.id });

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Pengguna"
        description="Kelola akun pemilik dan kasir."
        actions={
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <UserPlus className="size-[18px]" aria-hidden />
            Tambah pengguna
          </Button>
        }
      />
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className={header.id === 'actions' ? 'w-0' : ''}>
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-username={row.original.username}
                  className={row.original.active ? '' : 'text-muted-foreground'}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users === null && !error && <p className="px-4 py-3 text-muted-foreground">Memuat…</p>}
        </Card>
      </div>

      <CreateUserDialog
        open={dialog?.kind === 'create'}
        onClose={() => setDialog(null)}
        run={run}
      />
      {dialog?.kind === 'rename' && (
        <RenameDialog user={dialog.user} onClose={() => setDialog(null)} run={run} />
      )}
      {dialog?.kind === 'resetPin' && (
        <ResetPinDialog user={dialog.user} onClose={() => setDialog(null)} run={run} />
      )}
    </section>
  );
}

function UserStatus({ user }: { user: User }) {
  if (!user.active) return <Badge variant="neutral">Nonaktif</Badge>;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge variant="neutral">Aktif</Badge>
      {user.mustChangePin && <Badge variant="warning">PIN sementara</Badge>}
    </span>
  );
}

function UserActions({
  user,
  isSelf,
  onRename,
  onResetPin,
  onToggleActive,
}: {
  user: User;
  isSelf: boolean;
  onRename: () => void;
  onResetPin: () => void;
  onToggleActive: () => void;
}) {
  // Self-deactivation is blocked; the button stays focusable (aria-disabled) so the tooltip
  // explaining why is reachable by mouse and keyboard.
  const toggle = (
    <Button
      variant="ghost"
      size="sm"
      onClick={isSelf ? undefined : onToggleActive}
      aria-disabled={isSelf || undefined}
      className={cn(
        user.active && 'text-destructive hover:bg-destructive-soft',
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
      )}
    >
      <Power className="size-4" aria-hidden />
      {user.active ? 'Nonaktifkan' : 'Aktifkan'}
    </Button>
  );
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap">
      <Button variant="ghost" size="sm" onClick={onRename}>
        <Pencil className="size-4" aria-hidden />
        Ubah nama
      </Button>
      {user.role === 'cashier' && (
        <Button variant="ghost" size="sm" onClick={onResetPin}>
          <KeyRound className="size-4" aria-hidden />
          Atur ulang PIN
        </Button>
      )}
      {isSelf ? (
        <Tooltip>
          <TooltipTrigger asChild>{toggle}</TooltipTrigger>
          <TooltipContent>Anda tidak dapat menonaktifkan akun sendiri.</TooltipContent>
        </Tooltip>
      ) : (
        toggle
      )}
    </div>
  );
}

/** Wraps `run` so API errors come back as a message for the dialog. */
async function attempt(run: Run, task: () => Promise<unknown>, success: string) {
  try {
    await run(task, success);
    return null;
  } catch (err) {
    return errorMessage(err);
  }
}

function RenameDialog({ user, onClose, run }: { user: User; onClose: () => void; run: Run }) {
  const [name, setName] = useState(user.name);
  return (
    <FormDialog
      open
      title="Ubah nama"
      description={`Nama pengguna ${user.username} tidak dapat diubah.`}
      submitLabel="Simpan"
      onClose={onClose}
      onSubmit={async () =>
        name.trim()
          ? attempt(run, () => api.updateUser(user.id, { name }), 'Nama pengguna diperbarui.')
          : fieldMessages.name
      }
    >
      <TextField
        id={`rename-${user.id}`}
        label="Nama"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
    </FormDialog>
  );
}

function ResetPinDialog({ user, onClose, run }: { user: User; onClose: () => void; run: Run }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <FormDialog
      open
      title={`Atur ulang PIN ${user.name}`}
      description="Kasir wajib mengganti PIN sementara ini saat masuk. Sesi yang terbuka akan ditutup."
      submitLabel="Atur ulang PIN"
      onClose={onClose}
      onSubmit={async () =>
        checkPin(pin, confirm) ??
        attempt(
          run,
          () => api.updateUser(user.id, { pin }),
          `PIN ${user.name} diatur ulang. PIN sementara harus diganti saat masuk.`,
        )
      }
    >
      <PinField
        id={`pin-${user.id}`}
        label="PIN sementara"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        autoFocus
      />
      <PinField
        id={`pin-confirm-${user.id}`}
        label="Ulangi PIN"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </FormDialog>
  );
}

const emptyUser = { name: '', username: '', role: 'cashier' as Role, pin: '', confirm: '' };

function CreateUserDialog({
  open,
  onClose,
  run,
}: {
  open: boolean;
  onClose: () => void;
  run: Run;
}) {
  const [form, setForm] = useState(emptyUser);

  const set =
    (key: 'name' | 'username' | 'pin' | 'confirm') => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value });

  async function submit() {
    const problem =
      (form.name.trim() ? null : fieldMessages.name) ??
      checkUsername(form.username) ??
      checkPin(form.pin, form.confirm);
    if (problem) return problem;
    const { confirm: _, ...input } = form;
    const result = await attempt(
      run,
      () => api.createUser(input),
      `Pengguna ${form.username} dibuat. PIN sementara harus diganti saat pertama masuk.`,
    );
    if (!result) setForm(emptyUser);
    return result;
  }

  return (
    <FormDialog
      open={open}
      title="Tambah pengguna"
      description="Pengguna baru wajib mengganti PIN sementara saat pertama kali masuk."
      submitLabel="Tambah pengguna"
      onClose={() => {
        setForm(emptyUser);
        onClose();
      }}
      onSubmit={submit}
    >
      <TextField id="new-name" label="Nama" value={form.name} onChange={set('name')} autoFocus />
      <TextField
        id="new-username"
        label="Nama pengguna"
        value={form.username}
        onChange={set('username')}
        autoCapitalize="none"
        className="[&_input]:font-mono"
      />
      <div className="space-y-1.5">
        <Label htmlFor="new-role">Peran</Label>
        <Select value={form.role} onValueChange={(role: Role) => setForm({ ...form, role })}>
          <SelectTrigger id="new-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cashier">{roleLabels.cashier}</SelectItem>
            <SelectItem value="owner">{roleLabels.owner}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PinField id="new-pin" label="PIN sementara" value={form.pin} onChange={set('pin')} />
        <PinField
          id="new-confirm"
          label="Ulangi PIN"
          value={form.confirm}
          onChange={set('confirm')}
        />
      </div>
    </FormDialog>
  );
}
