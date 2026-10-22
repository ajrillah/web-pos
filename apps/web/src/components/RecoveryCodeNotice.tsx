import { useState } from 'react';

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
    <div className="space-y-4">
      <p className="text-slate-700">
        Ini <strong>kode pemulihan</strong> Anda. Kode ini dipakai untuk mengatur ulang PIN pemilik
        jika lupa, dan <strong>hanya ditampilkan sekali</strong>. Tulis dan simpan di tempat aman.
      </p>
      <output
        data-testid="recovery-code"
        className="block rounded border-2 border-dashed border-amber-400 bg-amber-50 py-4 text-center font-mono text-2xl font-bold tracking-widest text-slate-900"
      >
        {code}
      </output>
      <label className="flex items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="h-5 w-5"
        />
        Saya sudah mencatat kode ini.
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={onContinue}
        className="w-full rounded bg-slate-900 px-4 py-2 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {continueLabel}
      </button>
    </div>
  );
}
