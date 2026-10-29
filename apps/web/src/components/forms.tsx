import { pinSchema, usernameSchema } from '@toko-podomoro/shared';
import { CircleAlert } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { BrandMark } from './BrandMark';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

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

export function TextField({
  label,
  id,
  className,
  uppercase = false,
  ...props
}: FieldProps & {
  id: string /** Text the server stores uppercase (MS3). */;
  uppercase?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className={uppercase ? 'uppercase-input' : undefined} {...props} />
    </div>
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
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-control bg-destructive-soft px-4 py-3 text-destructive"
    >
      <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export function PrimaryButton({
  children,
  busy,
  className,
  ...props
}: { children: ReactNode; busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button type="submit" size="lg" disabled={busy} className={cn('w-full', className)} {...props}>
      {busy ? 'Memproses…' : children}
    </Button>
  );
}

/** Centered card used by setup, login, recovery, and the forced PIN change. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[440px] space-y-6">
        <BrandMark className="justify-center" />
        <Card className="space-y-6 p-8">
          <div className="space-y-1.5">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}
