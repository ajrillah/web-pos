import {
  type Customer,
  type CustomerLedgerResponse,
  type CustomerPayment,
  formatRupiah,
} from '@toko-podomoro/shared';
import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { ReceiptPromptDialog } from '../../components/receipts/ReceiptPromptDialog';
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
import { dateTime, SaleDetailDialog } from '../history/SaleDetailDialog';
import { CustomerPaymentDialog } from './CustomerPaymentDialog';
import { CustomerPicker } from './CustomerPicker';
import { PaymentDetailDialog } from './PaymentDetailDialog';
import { PaymentSummary } from './PaymentSummary';

/** Pelanggan > Kartu Piutang: one customer's kasbon and payments with a running balance. */
export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const customerId = params.get('id');
  const [ledger, setLedger] = useState<CustomerLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<CustomerPayment | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);
  const [openPayment, setOpenPayment] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!customerId) {
      setLedger(null);
      return;
    }
    api
      .customerLedger(customerId)
      .then((r) => {
        setLedger(r);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [customerId]);

  useEffect(load, [load]);

  const pick = (customer: Customer) => setParams({ id: customer.id });
  const customer = ledger?.customer;

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Kartu Piutang"
        description={customer ? customer.name : 'Pilih pelanggan untuk melihat kasbonnya.'}
        actions={
          customer && (
            <>
              <Button variant="secondary" onClick={() => setParams({})}>
                Ganti pelanggan
              </Button>
              <Button onClick={() => setPaying(true)} disabled={customer.balance === 0}>
                <Wallet className="size-[18px]" aria-hidden />
                Bayar kasbon
              </Button>
            </>
          )
        }
      />
      <ErrorAlert message={error} />
      {!customerId && (
        <Card className="max-w-xl p-6">
          <CustomerPicker onPick={pick} autoFocus />
        </Card>
      )}
      {ledger && customer && (
        <div className="space-y-5">
          <Card className="flex items-baseline justify-between p-6">
            <span className="label-caps">Sisa kasbon</span>
            <span
              className="text-[40px] leading-tight font-bold text-warning-foreground tabular-nums"
              data-testid="ledger-balance"
            >
              {formatRupiah(customer.balance)}
            </span>
          </Card>
          <Card className="px-3 py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No.</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Kasbon</TableHead>
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
                      entry.kind === 'kasbon'
                        ? setOpenSale(entry.refId)
                        : setOpenPayment(entry.refId)
                    }
                  >
                    <TableCell className="tabular-nums">{dateTime(entry.date)}</TableCell>
                    <TableCell className="font-mono text-[15px]">{entry.number}</TableCell>
                    <TableCell>
                      {entry.kind === 'kasbon' ? (
                        <Badge variant="warning">Kasbon</Badge>
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
              <p className="px-4 py-6 text-center text-muted-foreground">Belum ada kasbon.</p>
            )}
          </Card>
        </div>
      )}
      <CustomerPaymentDialog
        open={paying}
        customer={customer ?? null}
        onClose={() => setPaying(false)}
        onPaid={(payment) => {
          setPaying(false);
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
      <SaleDetailDialog saleId={openSale} onClose={() => setOpenSale(null)} />
      <PaymentDetailDialog paymentId={openPayment} onClose={() => setOpenPayment(null)} />
    </section>
  );
}
