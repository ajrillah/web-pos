import { useState } from 'react';
import { Button } from './ui/button';

/** Shows a one-time recovery code; the user must confirm they wrote it down before continuing. */
export function RecoveryCodeNotice({
  code,
  continueLabel,
  onContinue,
}: {
  code: string;
  continueLabel: string;
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">
        Ini <strong className="text-foreground">kode pemulihan</strong> Anda. Kode ini dipakai untuk
        mengatur ulang PIN pemilik jika lupa, dan{' '}
        <strong className="text-foreground">hanya ditampilkan sekali</strong>. Tulis dan simpan di
        tempat aman.
      </p>
      <output
        data-testid="recovery-code"
        className="block rounded-control border-2 border-dashed border-warning bg-warning-soft py-5 text-center font-mono text-2xl font-semibold tracking-[0.12em] text-foreground"
      >
        {code}
      </output>
      <label className="flex cursor-pointer items-center gap-3 font-medium">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-5 accent-primary"
        />
        Saya sudah mencatat kode ini.
      </label>
      <Button size="lg" className="w-full" disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  );
}
