import { formatRupiah, type Supplier, type SupplierPayment } from '@toko-podomoro/shared';
import { BookOpen, Pencil, Power, Search, Truck, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
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
import { PageHeader } from '../../layout/PageHeader';
import { SupplierFormDialog } from './SupplierFormDialog';
import { SupplierPaymentDialog } from './SupplierPaymentDialog';

type OpenDialog = { kind: 'form'; supplier: Supplier | null } | { kind: 'pay'; supplier: Supplier };

/** Pemasok > Daftar: search, add, edit, (de)activate, debt balance, Bayar hutang. */
export function SuppliersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const load = useCallback(() => {
    api
      .listSuppliers({ q: q.trim() || undefined, status, limit: 100 })
      .then((r) => {
        setSuppliers(r.suppliers);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [q, status]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleActive(supplier: Supplier) {
    try {
      await api.updateSupplier(supplier.id, { active: !supplier.active });
      toast.success(
        supplier.active ? `${supplier.name} dinonaktifkan.` : `${supplier.name} diaktifkan.`,
      );
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section>
      <PageHeader
        title="Pemasok"
        description="Hutang dicatat per pemasok dari stok masuk."
        actions={
          <Button onClick={() => setDialog({ kind: 'form', supplier: null })}>
            <Truck className="size-[18px]" aria-hidden />
            Tambah pemasok
          </Button>
        }
      />
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              data-search-input
              aria-label="Cari pemasok"
              placeholder="Nama atau no. HP"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-12"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger aria-label="Status" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="inactive">Nonaktif</SelectItem>
              <SelectItem value="all">Semua status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ErrorAlert message={error} />
        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Hutang</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers?.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  data-supplier={supplier.name}
                  className={supplier.active ? '' : 'text-muted-foreground'}
                >
                  <TableCell>
                    <div className="font-semibold">{supplier.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[supplier.phone, supplier.note].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {supplier.balance > 0 ? (
                      <span className="font-semibold text-warning-foreground">
                        {formatRupiah(supplier.balance)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{supplier.active ? 'Aktif' : 'Nonaktif'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {supplier.balance > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ kind: 'pay', supplier })}
                        >
                          <Wallet className="size-4" aria-hidden />
                          Bayar hutang
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/pemasok/kartu?id=${supplier.id}`}>
                          <BookOpen className="size-4" aria-hidden />
                          Kartu
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ kind: 'form', supplier })}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Ubah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleActive(supplier)}
                        className={
                          supplier.active ? 'text-destructive hover:bg-destructive-soft' : ''
                        }
                      >
                        <Power className="size-4" aria-hidden />
                        {supplier.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {suppliers?.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada pemasok.</p>
          )}
        </Card>
      </div>

      {dialog?.kind === 'form' && (
        <SupplierFormDialog
          supplier={dialog.supplier}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            toast.success(`${saved.name} disimpan.`);
            setDialog(null);
            load();
          }}
        />
      )}
      <SupplierPaymentDialog
        open={dialog?.kind === 'pay'}
        supplier={dialog?.kind === 'pay' ? dialog.supplier : null}
        onClose={() => setDialog(null)}
        onPaid={(payment: SupplierPayment) => {
          setDialog(null);
          toast.success(`${payment.number}: hutang dibayar ${formatRupiah(payment.amount)}.`);
          load();
        }}
      />
    </section>
  );
}
