import {
  formatRupiah,
  type Supplier,
  type SupplierLedgerResponse,
  type SupplierPayment,
} from '@toko-podomoro/shared';
import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
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
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';
import { PurchaseDetailDialog } from '../stock/PurchaseDetailDialog';
import { SupplierPaymentDetailDialog } from './SupplierPaymentDetailDialog';
import { SupplierPaymentDialog } from './SupplierPaymentDialog';
import { SupplierPicker } from './SupplierPicker';

/** Pemasok > Kartu Hutang: one supplier's purchases and payments with a running balance. */
export function SupplierLedgerPage() {
  const [params, setParams] = useSearchParams();
  const supplierId = params.get('id');
  const [ledger, setLedger] = useState<SupplierLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [openPurchase, setOpenPurchase] = useState<string | null>(null);
  const [openPayment, setOpenPayment] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!supplierId) {
      setLedger(null);
      return;
    }
    api
      .supplierLedger(supplierId)
      .then((r) => {
        setLedger(r);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [supplierId]);

  useEffect(load, [load]);

  const pick = (supplier: Supplier) => setParams({ id: supplier.id });
  const supplier = ledger?.supplier;

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Kartu Hutang"
        description={supplier ? supplier.name : 'Pilih pemasok untuk melihat hutangnya.'}
        actions={
          supplier && (
            <>
              <Button variant="secondary" onClick={() => setParams({})}>
                Ganti pemasok
              </Button>
              <Button onClick={() => setPaying(true)} disabled={supplier.balance === 0}>
                <Wallet className="size-[18px]" aria-hidden />
                Bayar hutang
              </Button>
            </>
          )
        }
      />
      <ErrorAlert message={error} />
      {!supplierId && (
        <Card className="max-w-xl p-6">
          <SupplierPicker onPick={pick} autoFocus />
        </Card>
      )}
      {ledger && supplier && (
        <div className="space-y-5">
          <Card className="flex items-baseline justify-between p-6">
            <span className="label-caps">Sisa hutang</span>
            <span
              className="text-[40px] leading-tight font-bold text-warning-foreground tabular-nums"
              data-testid="supplier-balance"
            >
              {formatRupiah(supplier.balance)}
            </span>
          </Card>
          <Card className="px-3 py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No.</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Pembelian</TableHead>
                  <TableHead className="text-right">Bayar</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.entries.map((entry) => (
                  <TableRow
                    key={`${entry.kind}-${entry.refId}`}
                    data-entry={entry.number}
                    className={cn(
                      'cursor-pointer',
                      entry.voided && 'text-muted-foreground line-through',
                    )}
                    onClick={() =>
                      entry.kind === 'purchase'
                        ? setOpenPurchase(entry.refId)
                        : setOpenPayment(entry.refId)
                    }
                  >
                    <TableCell className="tabular-nums">{dateTime(entry.date)}</TableCell>
                    <TableCell className="font-mono text-[15px]">{entry.number}</TableCell>
                    <TableCell>
                      {entry.kind === 'purchase' ? (
                        <Badge variant="warning">Stok masuk</Badge>
                      ) : (
                        <Badge variant="neutral">Bayar</Badge>
                      )}
                      {entry.voided && (
                        <Badge variant="destructive" className="ml-2">
                          Dibatalkan
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.change > 0 ? formatRupiah(entry.change) : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.change < 0 ? formatRupiah(-entry.change) : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatRupiah(entry.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {ledger.entries.length === 0 && (
              <p className="px-4 py-6 text-center text-muted-foreground">Belum ada stok masuk.</p>
            )}
          </Card>
        </div>
      )}
      <SupplierPaymentDialog
        open={paying}
        supplier={supplier ?? null}
        onClose={() => setPaying(false)}
        onPaid={(payment: SupplierPayment) => {
          setPaying(false);
          toast.success(`${payment.number}: hutang dibayar ${formatRupiah(payment.amount)}.`);
          load();
        }}
      />
      <PurchaseDetailDialog
        purchaseId={openPurchase}
        onClose={() => setOpenPurchase(null)}
        onChanged={load}
      />
      <SupplierPaymentDetailDialog
        paymentId={openPayment}
        onClose={() => setOpenPayment(null)}
        onChanged={load}
      />
    </section>
  );
}
