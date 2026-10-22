import { formatRupiah, type ReceivablesResponse } from '@toko-podomoro/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
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

const DAY_MS = 24 * 60 * 60 * 1000;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/** Pelanggan > Daftar Piutang: every open kasbon, oldest first, with its age. */
export function ReceivablesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ReceivablesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listReceivables({ status: 'open' })
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const now = Date.now();

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Daftar Piutang"
        description="Kasbon yang belum lunas, terlama di atas."
        actions={
          data && (
            <div className="text-right">
              <div className="label-caps">Total piutang</div>
              <div
                className="text-2xl font-bold text-warning-foreground tabular-nums"
                data-testid="receivables-total"
              >
                {formatRupiah(data.totalRemaining)}
              </div>
            </div>
          )
        }
      />
      <ErrorAlert message={error} />
      <Card className="px-3 py-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pelanggan</TableHead>
              <TableHead>No. TRX</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Umur</TableHead>
              <TableHead className="text-right">Kasbon</TableHead>
              <TableHead className="text-right">Sisa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.receivables.map((r) => (
              <TableRow
                key={r.id}
                data-receivable={r.saleNumber}
                className="cursor-pointer"
                onClick={() => navigate(`/pelanggan/kartu?id=${r.customerId}`)}
              >
                <TableCell className="font-semibold">{r.customerName}</TableCell>
                <TableCell className="font-mono text-[15px]">{r.saleNumber}</TableCell>
                <TableCell className="tabular-nums">{date(r.createdAt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.floor((now - new Date(r.createdAt).getTime()) / DAY_MS)} hari
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatRupiah(r.amount)}</TableCell>
                <TableCell className="text-right font-semibold text-warning-foreground tabular-nums">
                  {formatRupiah(r.remaining)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data?.receivables.length === 0 && (
          <p className="px-4 py-6 text-center text-muted-foreground">Tidak ada piutang.</p>
        )}
      </Card>
    </section>
  );
}
