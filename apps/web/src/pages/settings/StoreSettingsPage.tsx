import type { RoundingMode, Settings, UpdateSettingsRequest } from '@toko-podomoro/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert, TextField } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { PageHeader } from '../../layout/PageHeader';

const ROUNDING_LABELS: Record<RoundingMode, string> = {
  none: 'Tanpa pembulatan',
  '100': 'Ke Rp 100 terdekat',
  '500': 'Ke Rp 500 terdekat',
};

/** Pengaturan > Profil Toko (PIN menu): store details, rounding, receipt, auto-lock. */
export function StoreSettingsPage() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then(({ settings }) => {
        setSaved(settings);
        setForm(settings);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  if (!form || !saved) {
    return (
      <section>
        <PageHeader title="Profil Toko" />
        {error ? <ErrorAlert message={error} /> : <p className="text-muted-foreground">Memuat…</p>}
      </section>
    );
  }

  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form || !saved) return;
    // Only changed fields are sent; the server audit-logs each changed key.
    const changes = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => saved[key as keyof Settings] !== value),
    ) as UpdateSettingsRequest;
    if (Object.keys(changes).length === 0) {
      toast.success('Tidak ada perubahan.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { settings } = await api.updateSettings(changes);
      setSaved(settings);
      setForm(settings);
      toast.success('Pengaturan disimpan.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl">
      <PageHeader title="Profil Toko" description="Tampil di nota dan dipakai di layar Kasir." />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Toko</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4">
            <TextField
              id="storeName"
              label="Nama toko"
              value={form.storeName}
              onChange={(e) => set({ storeName: e.target.value })}
              autoFocus
            />
            <TextField
              id="storePhone"
              label="Telepon"
              value={form.storePhone}
              onChange={(e) => set({ storePhone: e.target.value })}
            />
            <TextField
              id="storeAddress"
              label="Alamat"
              value={form.storeAddress}
              onChange={(e) => set({ storeAddress: e.target.value })}
              className="col-span-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kasir dan nota</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rounding">Pembulatan total</Label>
              <Select
                value={form.rounding}
                onValueChange={(v) => set({ rounding: v as RoundingMode })}
              >
                <SelectTrigger id="rounding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROUNDING_LABELS) as RoundingMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {ROUNDING_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receiptWidth">Lebar nota</Label>
              <Select
                value={form.receiptWidth}
                onValueChange={(v) => set({ receiptWidth: v as Settings['receiptWidth'] })}
              >
                <SelectTrigger id="receiptWidth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58">58 mm</SelectItem>
                  <SelectItem value="80">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TextField
              id="receiptFooter"
              label="Catatan bawah nota"
              value={form.receiptFooter}
              onChange={(e) => set({ receiptFooter: e.target.value })}
              className="col-span-2"
            />
            <TextField
              id="receiptFolder"
              label="Folder nota"
              value={form.receiptFolder}
              onChange={(e) => set({ receiptFolder: e.target.value })}
              className="col-span-2 [&_input]:font-mono [&_input]:text-sm"
            />
            <div className="space-y-1.5">
              <Label htmlFor="autoLockMinutes">Kunci otomatis setelah</Label>
              <NumberInput
                id="autoLockMinutes"
                value={form.autoLockMinutes}
                onValueChange={(v) => set({ autoLockMinutes: v ?? 0 })}
                suffix="menit"
              />
            </div>
          </CardContent>
        </Card>

        <ErrorAlert message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="min-w-40">
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </form>
    </section>
  );
}
