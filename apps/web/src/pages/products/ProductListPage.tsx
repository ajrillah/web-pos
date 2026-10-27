import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import {
  type Category,
  formatInteger,
  formatRupiah,
  type Product,
  type ProductStatusFilter,
  type ProductsResponse,
} from '@toko-podomoro/shared';
import { ChevronLeft, ChevronRight, PackagePlus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
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
import { formatQty } from '../../lib/format';
import { cn } from '../../lib/utils';

const PAGE_SIZE = 25;
const ALL = 'all';

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Product>();

/** Price of the primary sell unit, e.g. `Rp 3.500 / pcs`. */
function primaryPrice(product: Product): string {
  const unit = product.units.find((u) => u.isBase);
  return unit ? `${formatRupiah(unit.sellPrice)} / ${unit.name}` : '—';
}

const columns = column.columns([
  column.accessor('code', {
    header: 'Kode',
    cell: ({ getValue }) => <span className="font-mono text-[15px]">{getValue()}</span>,
  }),
  column.accessor('name', {
    header: 'Nama barang',
    cell: ({ row }) => (
      <div className="leading-snug">
        <div className="font-semibold">{row.original.name}</div>
        <div className="text-sm text-muted-foreground">{row.original.categoryName}</div>
      </div>
    ),
  }),
  column.display({
    id: 'price',
    header: () => <span className="block text-right">Harga jual</span>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums whitespace-nowrap">{primaryPrice(row.original)}</div>
    ),
  }),
  column.accessor('stock', {
    header: () => <span className="block text-right">Stok</span>,
    cell: ({ row }) => (
      <div
        className={cn(
          'text-right tabular-nums whitespace-nowrap',
          row.original.stock < 0 && 'font-semibold text-destructive',
        )}
      >
        {formatQty(row.original.stock, row.original.baseUnit, row.original.unitChain)}
      </div>
    ),
  }),
  column.accessor('active', {
    header: () => <span className="sr-only">Status</span>,
    cell: ({ getValue }) => (getValue() ? null : <Badge variant="neutral">Nonaktif</Badge>),
  }),
]);

/** Barang > Daftar: search by code or name, filter by category and status, paginated. */
export function ProductListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const categoryId = params.get('kategori') ?? ALL;
  const status = (params.get('status') ?? 'active') as ProductStatusFilter;
  const page = Math.max(1, Number(params.get('hal')) || 1);

  const [search, setSearch] = useState(q);
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<ProductsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Updates the URL query; any filter change returns to page 1. */
  function update(next: Record<string, string | null>) {
    setParams(
      (current) => {
        const merged = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) {
          if (value === null || value === '') merged.delete(key);
          else merged.set(key, value);
        }
        if (!('hal' in next)) merged.delete('hal');
        return merged;
      },
      { replace: true },
    );
  }

  // Typing updates the URL after a short pause.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 250);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    api
      .listCategories()
      .then((r) => setCategories(r.categories))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    let current = true;
    api
      .listProducts({
        q: q || undefined,
        categoryId: categoryId === ALL ? undefined : categoryId,
        status,
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => {
        if (current) {
          setResult(r);
          setError(null);
        }
      })
      .catch((err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [q, categoryId, status, page]);

  const data = useMemo(() => result?.products ?? [], [result]);
  const table = useTable({ features, columns, data, getRowId: (p) => p.id });
  const total = result?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);

  return (
    <section>
      <PageHeader
        title="Barang"
        description="Cari dengan kode atau nama barang."
        actions={
          <Button asChild>
            <Link to="/barang/baru">
              <PackagePlus className="size-[18px]" aria-hidden />
              Tambah barang
            </Link>
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
              id="product-search"
              data-search-input
              aria-label="Cari barang"
              placeholder="Kode atau nama barang"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') update({ q: search.trim() || null });
              }}
              className="pl-12 text-[17px]"
              autoFocus
            />
          </div>
          <Select
            value={categoryId}
            onValueChange={(v) => update({ kategori: v === ALL ? null : v })}
          >
            <SelectTrigger aria-label="Kategori" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.active ? c.name : `${c.name} (nonaktif)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => update({ status: v === 'active' ? null : v })}
          >
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
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
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
                  data-code={row.original.code}
                  className={cn('cursor-pointer', !row.original.active && 'text-muted-foreground')}
                  onClick={() => navigate(`/barang/${row.original.id}`)}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {cell.column.id === 'name' ? (
                        // The name links to the form so rows are reachable by keyboard too.
                        <Link
                          to={`/barang/${row.original.id}`}
                          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-primary-soft"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <table.FlexRender cell={cell} />
                        </Link>
                      ) : (
                        <table.FlexRender cell={cell} />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result && total === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">
              {q ? 'Barang tidak ditemukan.' : 'Belum ada barang.'}
            </p>
          )}
          {!result && !error && <p className="px-4 py-3 text-muted-foreground">Memuat…</p>}
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground tabular-nums" data-testid="product-count">
            {first}–{last} dari {formatInteger(total)} barang
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ hal: String(page - 1) })}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={last >= total}
              onClick={() => update({ hal: String(page + 1) })}
            >
              Berikutnya
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
