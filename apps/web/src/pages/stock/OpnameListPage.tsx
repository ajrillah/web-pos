import type { Category, OpnameStatus, OpnameSummary } from '@toko-podomoro/shared';
import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
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
import { PageHeader } from '../../layout/PageHeader';
import { dateTime } from '../history/SaleDetailDialog';

export function OpnameStatusBadge({ status }: { status: OpnameStatus }) {
  if (status === 'open') return <Badge variant="warning">Berjalan</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">Dibatalkan</Badge>;
  return <Badge variant="neutral">Selesai</Badge>;
}

/** Stok > Opname: counting sessions per category; start a new one. */
export function OpnameListPage() {
  const navigate = useNavigate();
  const [opnames, setOpnames] = useState<OpnameSummary[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listOpnames({})
      .then((r) => setOpnames(r.opnames))
      .catch((err: unknown) => setError(errorMessage(err)));
    api
      .listCategories()
      .then((r) => setCategories(r.categories.filter((c) => c.active)))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  async function start() {
    if (!categoryId) {
      setError('Pilih kategori yang akan dihitung.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { opname } = await api.startOpname(categoryId);
      navigate(`/stok/opname/${opname.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-5xl">
      <PageHeader
        title="Stok opname"
        description="Hitung stok fisik per kategori. Penjualan tetap berjalan selama opname."
      />
      <div className="space-y-5">
        <Card className="flex items-end gap-4 p-6">
          <div className="w-72 space-y-1.5">
            <Label htmlFor="opname-category">Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="opname-category">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void start()} disabled={busy}>
            <ClipboardList className="size-[18px]" aria-hidden />
            Mulai opname
          </Button>
        </Card>
        <ErrorAlert message={error} />
        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead>Mulai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Dihitung</TableHead>
                <TableHead>Oleh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opnames?.map((o) => (
                <TableRow
                  key={o.id}
                  data-opname={o.categoryName}
                  className="cursor-pointer"
                  onClick={() => navigate(`/stok/opname/${o.id}`)}
                >
                  <TableCell className="font-semibold">{o.categoryName}</TableCell>
                  <TableCell className="tabular-nums">{dateTime(o.startedAt)}</TableCell>
                  <TableCell>
                    <OpnameStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.countedCount} / {o.itemCount}
                  </TableCell>
                  <TableCell>{o.closedByName ?? o.userName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {opnames?.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Belum ada opname.</p>
          )}
        </Card>
      </div>
    </section>
  );
}
