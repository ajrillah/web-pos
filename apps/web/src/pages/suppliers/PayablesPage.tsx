import { formatRupiah, type PayablesResponse } from '@toko-podomoro/shared';
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
import { dayLabel } from '../../lib/format';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pemasok > Daftar Hutang: every purchase with remaining debt, oldest first, with its age. */
export function PayablesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PayablesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPayables({})
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const now = Date.now();

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Daftar Hutang"
        description="Stok masuk yang belum lunas, terlama di atas."
        actions={
          data && (
            <div className="text-right">
              <div className="label-caps">Total hutang</div>
              <div
                className="text-2xl font-bold text-warning-foreground tabular-nums"
                data-testid="payables-total"
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
              <TableHead>Pemasok</TableHead>
              <TableHead>No.</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Umur</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Sisa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.purchases.map((p) => (
              <TableRow
                key={p.id}
                data-payable={p.number}
                className="cursor-pointer"
                onClick={() => navigate(`/pemasok/kartu?id=${p.supplierId}`)}
              >
                <TableCell className="font-semibold">{p.supplierName}</TableCell>
                <TableCell className="font-mono text-[15px]">{p.number}</TableCell>
                <TableCell className="tabular-nums">{dayLabel(p.date)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.floor((now - new Date(p.createdAt).getTime()) / DAY_MS)} hari
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatRupiah(p.total)}</TableCell>
                <TableCell className="text-right font-semibold text-warning-foreground tabular-nums">
                  {formatRupiah(p.remaining)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data?.purchases.length === 0 && (
          <p className="px-4 py-6 text-center text-muted-foreground">Tidak ada hutang.</p>
        )}
      </Card>
    </section>
  );
}
