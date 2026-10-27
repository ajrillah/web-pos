import {
  formatInteger,
  formatRupiah,
  type ImportPreviewResponse,
  type ImportRequest,
  type ImportRow,
  MAX_IMPORT_FILE_BYTES,
} from '@toko-podomoro/shared';
import { CircleAlert, Download, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { productImport } from '../../api/endpoints';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { PageHeader } from '../../layout/PageHeader';

type Filter = 'all' | 'invalid';

interface Loaded {
  file: ImportRequest;
  preview: ImportPreviewResponse;
}

/** Base64 of a file's bytes, in chunks (spreading a large array overflows the stack). */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const TYPE_LABELS = { unit: 'Satuan', bulk: 'Curah' } as const;

/**
 * Barang > Impor (owner PIN menu for cashiers): pick an .xlsx / .csv file, review every row with
 * its errors, then import all rows at once. Any error blocks the whole file (docs/design.md 6.5).
 */
export function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<'template' | 'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirming, setConfirming] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  async function downloadTemplate() {
    setBusy('template');
    try {
      toast.success(`Template disimpan: ${await productImport.downloadTemplate()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function check(file: ImportRequest) {
    setBusy('preview');
    setError(null);
    try {
      const preview = await productImport.preview(file);
      setLoaded({ file, preview });
      setFilter(preview.invalid > 0 ? 'invalid' : 'all');
    } catch (err) {
      setLoaded(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function pick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setImported(null);
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setLoaded(null);
      setError('Format file tidak didukung. Gunakan file .xlsx atau .csv.');
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setLoaded(null);
      setError('Ukuran file paling besar 5 MB.');
      return;
    }
    await check({ fileName: file.name, contentBase64: await toBase64(file) });
  }

  async function commit() {
    if (!loaded) return;
    setConfirming(false);
    setBusy('commit');
    setError(null);
    try {
      const result = await productImport.commit(loaded.file);
      toast.success(`${formatInteger(result.imported)} barang diimpor.`);
      setImported(result.imported);
      setLoaded(null);
    } catch (err) {
      setError(errorMessage(err));
      // Data may have changed since the preview (e.g. a code was taken): show the rows again.
      await check(loaded.file);
    } finally {
      setBusy(null);
    }
  }

  const preview = loaded?.preview;
  const rows = preview?.rows.filter((r) => filter === 'all' || r.errors.length > 0) ?? [];
  const canImport = preview !== undefined && preview.invalid === 0 && busy === null;

  return (
    <section>
      <PageHeader
        title="Impor barang"
        description="Tambah banyak barang baru sekaligus dari file Excel (.xlsx) atau CSV (UTF-8)."
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void downloadTemplate()}
            >
              <Download className="size-[18px]" aria-hidden />
              {busy === 'template' ? 'Menyimpan…' : 'Unduh template'}
            </Button>
            <Button
              variant={preview ? 'outline' : 'default'}
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="size-[18px]" aria-hidden />
              {preview ? 'Ganti file' : 'Pilih file'}
            </Button>
          </>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="File impor barang"
        data-testid="import-file"
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      <div className="space-y-4">
        <ErrorAlert message={error} />

        {imported !== null && (
          <Card className="flex items-center justify-between gap-4 px-6 py-5">
            <p className="text-base" data-testid="import-done">
              <span className="font-semibold">{formatInteger(imported)} barang</span> berhasil
              diimpor.
            </p>
            <Button variant="outline" asChild>
              <Link to="/barang">Lihat daftar barang</Link>
            </Button>
          </Card>
        )}

        {!preview && imported === null && (
          <Card className="px-6 py-6">
            <div className="flex items-start gap-4">
              <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              <div className="space-y-3">
                <p className="text-base font-semibold">
                  {busy === 'preview' ? 'Memeriksa file…' : 'Cara impor'}
                </p>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  <li>
                    Unduh template, lalu isi sheet "Barang" mulai baris 2 (lihat sheet "Petunjuk").
                  </li>
                  <li>Pilih file yang sudah diisi. Semua baris diperiksa dan ditampilkan dulu.</li>
                  <li>Jika semua baris benar, tekan Impor. Barang disimpan sekaligus.</li>
                </ol>
                <ul className="space-y-1 text-[15px] text-subtle-foreground">
                  <li>
                    Hanya barang baru: kode yang sudah ada (termasuk barang nonaktif) ditolak.
                  </li>
                  <li>Kategori harus sudah ada di Barang &gt; Kategori.</li>
                  <li>Jika ada satu baris bermasalah, tidak ada barang yang disimpan.</li>
                </ul>
              </div>
            </div>
          </Card>
        )}

        {preview && loaded && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-auto min-w-0 truncate">
                <span className="font-mono">{loaded.file.fileName}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {formatInteger(preview.total)} baris
                </span>
              </p>
              <Badge variant="neutral" data-testid="import-valid">
                {formatInteger(preview.valid)} siap
              </Badge>
              {preview.invalid > 0 && (
                <Badge variant="destructive" data-testid="import-invalid">
                  {formatInteger(preview.invalid)} bermasalah
                </Badge>
              )}
              <Button
                disabled={!canImport}
                onClick={() => setConfirming(true)}
                data-testid="import-commit"
              >
                <Upload className="size-[18px]" aria-hidden />
                {busy === 'commit' ? 'Mengimpor…' : `Impor ${formatInteger(preview.valid)} barang`}
              </Button>
            </div>

            {preview.invalid > 0 && (
              <p
                role="alert"
                className="flex items-start gap-2.5 rounded-control bg-destructive-soft px-4 py-3 text-destructive"
              >
                <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
                <span>
                  {formatInteger(preview.invalid)} baris bermasalah. Tidak ada barang yang akan
                  disimpan sebelum semua baris benar. Perbaiki file, lalu pilih ulang.
                </span>
              </p>
            )}

            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList aria-label="Tampilkan baris">
                <TabsTrigger value="all">Semua ({formatInteger(preview.total)})</TabsTrigger>
                <TabsTrigger value="invalid" disabled={preview.invalid === 0}>
                  Bermasalah ({formatInteger(preview.invalid)})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Card className="px-3 py-4">
              <Table className="text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Baris</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Harga pokok</TableHead>
                    <TableHead>Satuan jual</TableHead>
                    <TableHead className="text-right">Stok awal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <PreviewRow key={row.row} row={row} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Impor ${formatInteger(preview?.valid ?? 0)} barang?`}
        description="Semua barang di file ini disimpan sekaligus. Barang yang sudah diimpor tidak dapat dihapus, hanya dinonaktifkan."
        confirmLabel="Impor"
        onConfirm={() => void commit()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function PreviewRow({ row }: { row: ImportRow }) {
  const product = row.product;
  const v = row.values;
  const invalid = row.errors.length > 0;
  return (
    <TableRow data-import-row={row.row} data-invalid={invalid || undefined} className="align-top">
      <TableCell className="text-right tabular-nums text-muted-foreground">{row.row}</TableCell>
      <TableCell className="font-mono text-[15px] whitespace-nowrap">
        {product?.code ?? v.kode}
      </TableCell>
      <TableCell className="font-semibold">{product?.name ?? v.nama}</TableCell>
      <TableCell>
        {product?.categoryName ?? v.kategori}
        <span className="block text-sm text-muted-foreground">
          {product ? TYPE_LABELS[product.type] : v.jenis}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {product ? (
          <>
            {formatRupiah(product.costPrice)}
            <span className="block text-sm text-muted-foreground">
              per {product.type === 'bulk' ? product.units[0]?.name : product.baseUnit}
            </span>
          </>
        ) : (
          v.harga_pokok
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {product
          ? product.units.map((u) => (
              <span key={u.name} className="block tabular-nums">
                {u.name}
                {u.isi > 1 && product.type === 'unit' && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({formatInteger(u.isi)} {product.baseUnit})
                  </span>
                )}{' '}
                {formatRupiah(u.sellPrice)}
              </span>
            ))
          : [v.satuan_jual, v.harga_jual].filter(Boolean).join(' ')}
      </TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {product
          ? product.initialStock > 0
            ? `${formatInteger(product.initialStock)} ${product.baseUnit}`
            : '—'
          : v.stok_awal}
      </TableCell>
      <TableCell className="min-w-44">
        {invalid ? (
          <ul className="space-y-1 text-[15px] text-destructive">
            {row.errors.map((message) => (
              <li key={message} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Badge variant="neutral">Siap</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
