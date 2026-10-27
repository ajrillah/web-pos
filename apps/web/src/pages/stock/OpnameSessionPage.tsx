import { formatInteger, type Opname, type OpnameItem } from '@toko-podomoro/shared';
import { ArrowLeft, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorAlert } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { PageHeader } from '../../layout/PageHeader';
import { formatQty } from '../../lib/format';
import { cn } from '../../lib/utils';
import { dateTime } from '../history/SaleDetailDialog';
import { OpnameStatusBadge } from './OpnameListPage';

/**
 * One opname session: enter counted quantities (saved as you leave each field), then complete
 * (counted - stock at start is applied to current stock) or cancel.
 */
export function OpnameSessionPage() {
  const { id = '' } = useParams();
  const [opname, setOpname] = useState<Opname | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);

  const load = useCallback(() => {
    api
      .getOpname(id)
      .then((r) => setOpname(r.opname))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [id]);

  useEffect(load, [load]);

  async function saveCount(item: OpnameItem) {
    if (!(item.productId in drafts)) return;
    const countedQty = drafts[item.productId] ?? null;
    if (countedQty === item.countedQty) return;
    try {
      const { opname: next } = await api.updateOpnameItems(id, {
        items: [{ productId: item.productId, countedQty }],
      });
      setOpname(next);
      setDrafts(({ [item.productId]: _, ...rest }) => rest);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function finish(action: 'complete' | 'cancel') {
    setConfirm(null);
    try {
      if (action === 'complete') {
        // Counts still being typed are saved first.
        const pending = Object.entries(drafts).map(([productId, countedQty]) => ({
          productId,
          countedQty,
        }));
        if (pending.length > 0) {
          await api.updateOpnameItems(id, { items: pending });
          setDrafts({});
        }
        const { opname: done, warnings } = await api.completeOpname(id);
        setOpname(done);
        toast.success(`Opname ${done.categoryName} selesai. Stok disesuaikan.`);
        for (const w of warnings) {
          toast.warning(`Stok ${w.productName} sekarang ${formatQty(w.stock, w.baseUnit)}.`);
        }
      } else {
        const { opname: cancelled } = await api.cancelOpname(id);
        setOpname(cancelled);
        toast.success(`Opname ${cancelled.categoryName} dibatalkan.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const open = opname?.status === 'open';
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = (opname?.items ?? []).filter((i) =>
    words.every((w) => `${i.productCode} ${i.productName}`.toLowerCase().includes(w)),
  );
  const uncounted = (opname?.itemCount ?? 0) - (opname?.countedCount ?? 0);

  return (
    <section className="max-w-6xl">
      <Link
        to="/stok/opname"
        className="mb-3 inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Daftar opname
      </Link>
      <PageHeader
        title={opname ? `Opname ${opname.categoryName}` : 'Opname'}
        description={
          opname && (
            <span className="flex items-center gap-2">
              <OpnameStatusBadge status={opname.status} />
              Mulai {dateTime(opname.startedAt)} oleh {opname.userName}
              {opname.closedAt &&
                ` · ${opname.status === 'completed' ? 'selesai' : 'dibatalkan'} ${dateTime(opname.closedAt)}`}
            </span>
          )
        }
        actions={
          open && (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive-soft"
                onClick={() => setConfirm('cancel')}
              >
                Batalkan opname
              </Button>
              <Button onClick={() => setConfirm('complete')}>Selesaikan opname</Button>
            </>
          )
        }
      />
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              data-search-input
              aria-label="Cari barang"
              placeholder="Cari kode atau nama barang"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-12"
            />
          </div>
          {opname && (
            <p className="text-muted-foreground tabular-nums" data-testid="opname-progress">
              {opname.countedCount} dari {opname.itemCount} barang dihitung
            </p>
          )}
        </div>
        <ErrorAlert message={error} />
        <Card className="px-3 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barang</TableHead>
                <TableHead className="text-right">Stok awal</TableHead>
                <TableHead className="text-right">Stok sekarang</TableHead>
                <TableHead className="w-52 text-right">Hitungan</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const draft =
                  item.productId in drafts ? (drafts[item.productId] ?? null) : item.countedQty;
                const delta = draft === null ? null : draft - item.systemQtyAtStart;
                return (
                  <TableRow key={item.productId} data-opname-item={item.productCode}>
                    <TableCell>
                      <div className="font-semibold">{item.productName}</div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {item.productCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(item.systemQtyAtStart, item.baseUnit, item.unitChain)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums text-muted-foreground',
                        item.currentStock < 0 && 'font-semibold text-destructive',
                      )}
                    >
                      {formatQty(item.currentStock, item.baseUnit, item.unitChain)}
                    </TableCell>
                    <TableCell>
                      {open ? (
                        <NumberInput
                          aria-label={`Hitungan ${item.productName}`}
                          data-count-input={item.productCode}
                          value={draft}
                          onValueChange={(v) => setDrafts((d) => ({ ...d, [item.productId]: v }))}
                          onBlur={() => void saveCount(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          suffix={item.baseUnit}
                        />
                      ) : (
                        <div className="text-right tabular-nums">
                          {item.countedQty === null
                            ? '—'
                            : formatQty(item.countedQty, item.baseUnit)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        delta !== null && delta < 0 && 'text-destructive',
                      )}
                    >
                      {delta === null ? '—' : `${delta > 0 ? '+' : ''}${formatInteger(delta)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {opname && items.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">Barang tidak ditemukan</p>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={confirm === 'complete'}
        title="Selesaikan opname?"
        description={
          uncounted > 0
            ? `Selisih dihitung dari stok awal dan diterapkan ke stok sekarang. ${uncounted} barang belum dihitung dan tidak diubah.`
            : 'Selisih dihitung dari stok awal dan diterapkan ke stok sekarang.'
        }
        confirmLabel="Selesaikan"
        onConfirm={() => void finish('complete')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Batalkan opname?"
        description="Hitungan dibuang dan stok tidak berubah."
        confirmLabel="Batalkan opname"
        destructive
        onConfirm={() => void finish('cancel')}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
