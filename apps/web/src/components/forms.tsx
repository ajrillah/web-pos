import { pinSchema, usernameSchema } from '@toko-podomoro/shared';
import type { InputHTMLAttributes, ReactNode } from 'react';

export const fieldMessages = {
  pin: 'PIN harus 6 angka.',
  pinMismatch: 'Ulangi PIN tidak sama.',
  username: 'Nama pengguna 3–32 karakter: huruf kecil, angka, titik, strip, atau garis bawah.',
  name: 'Nama wajib diisi.',
} as const;

/** Client-side checks with friendly Indonesian messages; the server validates again. */
export function checkPin(pin: string, confirm?: string): string | null {
  if (!pinSchema.safeParse(pin).success) return fieldMessages.pin;
  if (confirm !== undefined && pin !== confirm) return fieldMessages.pinMismatch;
  return null;
}

export function checkUsername(username: string): string | null {
  return usernameSchema.safeParse(username).success ? null : fieldMessages.username;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, ...props }: FieldProps & { id: string }) {
  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        id={id}
        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-lg focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
        {...props}
      />
    </label>
  );
}

/** Six-digit PIN input: masked, numeric keypad, no autofill. */
export function PinField(props: FieldProps & { id: string }) {
  return (
    <TextField
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      pattern="\d{6}"
      {...props}
    />
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">
      {message}
    </p>
  );
}

export function PrimaryButton({
  children,
  busy,
  ...props
}: { children: ReactNode; busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded bg-slate-900 px-4 py-2 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      {...props}
    >
      {busy ? 'Memproses…' : children}
    </button>
  );
}

/** Centered card used by setup, login, recovery, and the forced PIN change. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-1 text-center">
          <div className="text-sm font-bold tracking-widest text-slate-500">TOKO PODOMORO</div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
