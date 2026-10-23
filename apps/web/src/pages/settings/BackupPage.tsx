import { DatabaseBackup, Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { dataBackup, health } from '../../api/endpoints';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorAlert } from '../../components/forms';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { PageHeader } from '../../layout/PageHeader';

/** How long to wait for the restarted server before asking the user to reopen the app. */
const RESTART_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the old server has gone and a new one answers /api/health. */
async function waitForRestart(): Promise<boolean> {
  await sleep(1500);
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await health();
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

/**
 * Pengaturan > Cadangan Data (owners only): download a backup .zip, or restore one. A restore
 * replaces all data and restarts the server (docs/design.md 11.4).
 */
export function BackupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [restarting, setRestarting] = useState(false);

  async function backup() {
    setBusy('backup');
    setError(null);
    try {
      toast.success(`Cadangan disimpan: ${await dataBackup.download()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function pick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Pilih file cadangan .zip dari menu Cadangkan Data.');
      return;
    }
    setError(null);
    setPicked(file);
  }

  async function restore() {
    const file = picked;
    setPicked(null);
    if (!file) return;
    setBusy('restore');
    setError(null);
    try {
      await dataBackup.restore(file);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
      return;
    }
    setRestarting(true);
    if (await waitForRestart()) {
      // Sessions came back with the restored data; start over from the login check.
      window.location.assign('/');
      return;
    }
    setRestarting(false);
    setBusy(null);
    setError(
      'Data sudah dipulihkan, tetapi aplikasi belum berjalan lagi. Tutup lalu buka kembali TOKO PODOMORO.',
    );
  }

  return (
    <section className="max-w-3xl">
      <PageHeader
        title="Cadangan Data"
        description="Simpan salinan data toko ke file .zip, atau pulihkan data dari file cadangan."
      />
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-label="File cadangan"
        data-testid="restore-file"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="space-y-4">
        <ErrorAlert message={error} />
        {restarting && (
          <p
            role="status"
            data-testid="restarting"
            className="rounded-control bg-muted px-4 py-3 text-muted-foreground"
          >
            Data dipulihkan. Memulai ulang aplikasi…
          </p>
        )}

        <Card className="flex items-start gap-4 px-6 py-6">
          <DatabaseBackup className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Cadangkan Data</h2>
              <p className="text-muted-foreground">
                Database, file konfigurasi, dan semua nota PDF disimpan dalam satu file .zip. Simpan
                file itu di flashdisk atau tempat lain di luar komputer ini.
              </p>
            </div>
            <Button data-testid="backup" disabled={busy !== null} onClick={() => void backup()}>
              <Download className="size-[18px]" aria-hidden />
              {busy === 'backup' ? 'Menyimpan…' : 'Cadangkan Data'}
            </Button>
          </div>
        </Card>

        <Card className="flex items-start gap-4 px-6 py-6">
          <RotateCcw className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Pulihkan Data</h2>
              <p className="text-muted-foreground">
                Mengganti semua data saat ini dengan isi file cadangan. Data saat ini disalin dulu
                ke folder <span className="font-mono">cadangan-sebelum-pulihkan</span> di folder
                data aplikasi.
              </p>
            </div>
            <Button
              variant="outline"
              data-testid="restore"
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-[18px]" aria-hidden />
              {busy === 'restore' ? 'Memulihkan…' : 'Pulihkan Data'}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={picked !== null}
        destructive
        title="Ganti semua data saat ini?"
        description={
          <>
            Semua data saat ini (barang, transaksi, kasbon, pengguna, pengaturan) akan diganti
            dengan isi <span className="font-mono">{picked?.name}</span>. Aplikasi akan dimulai
            ulang dan Anda perlu masuk lagi.
          </>
        }
        confirmLabel="Pulihkan"
        onConfirm={() => void restore()}
        onCancel={() => setPicked(null)}
      />
    </section>
  );
}
