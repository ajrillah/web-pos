import { type Customer, type CustomerPayment, formatRupiah } from '@toko-podomoro/shared';
import { BookOpen, Pencil, Power, Search, UserPlus, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { ReceiptPromptDialog } from '../../components/receipts/ReceiptPromptDialog';
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
import { CustomerFormDialog } from './CustomerFormDialog';
import { CustomerPaymentDialog } from './CustomerPaymentDialog';
import { PaymentSummary } from './PaymentSummary';

type OpenDialog = { kind: 'form'; customer: Customer | null } | { kind: 'pay'; customer: Customer };

/** Pelanggan > Daftar: search, add, edit, (de)activate, kasbon balance, Bayar kasbon. */
export function CustomersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [paid, setPaid] = useState<CustomerPayment | null>(null);

  const load = useCallback(() => {
    api
      .listCustomers({ q: q.trim() || undefined, status, limit: 100 })
      .then((r) => {
        setCustomers(r.customers);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [q, status]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleActive(customer: Customer) {
    try {
      await api.updateCustomer(customer.id, { active: !customer.active });
      toast.success(
        customer.active ? `${customer.name} dinonaktifkan.` : `${customer.name} diaktifkan.`,
      );
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section>
      <PageHeader
        title="Pelanggan"
        description="Kasbon dicatat per pelanggan."
        actions={
          <Button onClick={() => setDialog({ kind: 'form', customer: null })}>
            <UserPlus className="size-[18px]" aria-hidden />
            Tambah pelanggan
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
              aria-label="Cari pelanggan"
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
                <TableHead className="text-right">Kasbon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers?.map((customer) => (
                <TableRow
                  key={customer.id}
                  data-customer={customer.name}
                  className={customer.active ? '' : 'text-muted-foreground'}
                >
                  <TableCell>
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[customer.phone, customer.note].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {customer.balance > 0 ? (
                      <span className="font-semibold text-warning-foreground">
                        {formatRupiah(customer.balance)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{customer.active ? 'Aktif' : 'Nonaktif'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {customer.balance > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialog({ kind: 'pay', customer })}
                        >
                          <Wallet className="size-4" aria-hidden />
                          Bayar kasbon
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/pelanggan/kartu?id=${customer.id}`}>
                          <BookOpen className="size-4" aria-hidden />
                          Kartu
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ kind: 'form', customer })}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Ubah
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleActive(customer)}
                        className={
                          customer.active ? 'text-destructive hover:bg-destructive-soft' : ''
                        }
                      >
                        <Power className="size-4" aria-hidden />
                        {customer.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {customers?.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada pelanggan.</p>
          )}
        </Card>
      </div>

      {dialog?.kind === 'form' && (
        <CustomerFormDialog
          customer={dialog.customer}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            toast.success(`${saved.name} disimpan.`);
            setDialog(null);
            load();
          }}
        />
      )}
      <CustomerPaymentDialog
        open={dialog?.kind === 'pay'}
        customer={dialog?.kind === 'pay' ? dialog.customer : null}
        onClose={() => setDialog(null)}
        onPaid={(payment) => {
          setDialog(null);
          setPaid(payment);
          load();
        }}
      />
      <ReceiptPromptDialog
        doc={paid ? { kind: 'payment', id: paid.id, number: paid.number } : null}
        title="Kasbon dibayar"
        summary={paid && <PaymentSummary payment={paid} />}
        onClose={() => setPaid(null)}
      />
    </section>
  );
}
