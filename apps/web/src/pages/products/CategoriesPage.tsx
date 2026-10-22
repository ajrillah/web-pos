import type { Category } from '@toko-podomoro/shared';
import { FolderPlus, Pencil, Power } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useCurrentUser } from '../../auth/AuthProvider';
import { FormDialog } from '../../components/FormDialog';
import { ErrorAlert, TextField } from '../../components/forms';
import { PinHint } from '../../components/PinHint';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { PageHeader } from '../../layout/PageHeader';

type OpenDialog = { kind: 'create' } | { kind: 'rename'; category: Category } | null;

/** Barang > Kategori: everyone reads; adding and changing categories is owner-only (PIN). */
export function CategoriesPage() {
  const user = useCurrentUser();
  const locked = user.role !== 'owner';
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const load = useCallback(async () => {
    try {
      setCategories((await api.listCategories()).categories);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves via `task`; returns an error message for the dialog, or null. */
  async function save(task: () => Promise<unknown>, success: string): Promise<string | null> {
    try {
      await task();
      toast.success(success);
      setDialog(null);
      setError(null);
      await load();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  async function toggleActive(category: Category) {
    const problem = await save(
      () => api.updateCategory(category.id, { active: !category.active }),
      category.active ? `${category.name} dinonaktifkan.` : `${category.name} diaktifkan.`,
    );
    if (problem) setError(problem);
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        title="Kategori"
        description="Kategori bawaan tidak dapat dinonaktifkan."
        actions={
          <Button
            onClick={locked ? undefined : () => setDialog({ kind: 'create' })}
            aria-disabled={locked || undefined}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            <FolderPlus className="size-[18px]" aria-hidden />
            Tambah kategori
            {locked && <PinHint />}
          </Button>
        }
      />
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories?.map((category) => (
                <TableRow
                  key={category.id}
                  data-category={category.name}
                  className={category.active ? '' : 'text-muted-foreground'}
                >
                  <TableCell className="font-semibold">
                    {category.name}
                    {category.isDefault && (
                      <Badge variant="neutral" className="ml-2.5 align-middle">
                        Bawaan
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{category.active ? 'Aktif' : 'Nonaktif'}</Badge>
                  </TableCell>
                  <TableCell>
                    {!locked && (
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ kind: 'rename', category })}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Ubah nama
                        </Button>
                        {!category.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void toggleActive(category)}
                            className={
                              category.active ? 'text-destructive hover:bg-destructive-soft' : ''
                            }
                          >
                            <Power className="size-4" aria-hidden />
                            {category.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {categories === null && !error && (
            <p className="px-4 py-3 text-muted-foreground">Memuat…</p>
          )}
        </Card>
      </div>

      {dialog && (
        <CategoryDialog
          category={dialog.kind === 'rename' ? dialog.category : null}
          onClose={() => setDialog(null)}
          onSave={(name) =>
            dialog.kind === 'rename'
              ? save(
                  () => api.updateCategory(dialog.category.id, { name }),
                  'Nama kategori diperbarui.',
                )
              : save(() => api.createCategory({ name }), `Kategori ${name} ditambahkan.`)
          }
        />
      )}
    </section>
  );
}

function CategoryDialog({
  category,
  onClose,
  onSave,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  return (
    <FormDialog
      open
      title={category ? 'Ubah nama kategori' : 'Tambah kategori'}
      submitLabel="Simpan"
      onClose={onClose}
      onSubmit={async () => (name.trim() ? onSave(name.trim()) : 'Nama kategori wajib diisi.')}
    >
      <TextField
        id="category-name"
        label="Nama kategori"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        autoComplete="off"
      />
    </FormDialog>
  );
}
