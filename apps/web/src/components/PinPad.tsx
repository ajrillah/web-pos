import { Delete } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/**
 * 6-digit PIN entry: a masked field (the keyboard types into it) and an on-screen pad.
 * Submits by itself at the sixth digit; clears after a wrong PIN.
 */
export function PinPad({
  onSubmit,
  error,
  busy = false,
  label = 'PIN',
}: {
  /** Resolves to an error message to show, or null when the PIN was accepted. */
  onSubmit: (pin: string) => Promise<string | null>;
  error?: string | null;
  busy?: boolean;
  label?: string;
}) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(value: string) {
    if (value.length !== 6 || working) return;
    setWorking(true);
    const problem = await onSubmit(value);
    setWorking(false);
    if (problem) {
      setMessage(problem);
      setPin('');
      inputRef.current?.focus();
    }
  }

  function change(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setMessage(null);
    if (digits.length === 6) void submit(digits);
  }

  function press(key: (typeof KEYS)[number]) {
    if (key === 'clear') change('');
    else if (key === 'back') change(pin.slice(0, -1));
    else change(pin + key);
    inputRef.current?.focus();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void submit(pin);
      }}
    >
      <div className="flex justify-center gap-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positions never reorder.
            key={i}
            className={cn(
              'size-4 rounded-full border-2 border-primary transition-colors',
              i < pin.length ? 'bg-primary' : 'bg-transparent',
            )}
          />
        ))}
      </div>
      <input
        ref={inputRef}
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        value={pin}
        onChange={(e) => change(e.target.value)}
        disabled={busy || working}
        className="sr-only"
      />
      <p
        role="alert"
        className={cn(
          'min-h-6 text-center font-semibold text-destructive',
          !message && 'invisible',
        )}
      >
        {message ?? '-'}
      </p>
      <div className="mx-auto grid w-[240px] grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <Button
            key={key}
            variant={key === 'clear' || key === 'back' ? 'ghost' : 'secondary'}
            className="h-14 rounded-[16px] text-2xl tabular-nums"
            tabIndex={-1}
            disabled={busy || working}
            aria-label={key === 'back' ? 'Hapus angka' : key === 'clear' ? 'Kosongkan' : key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(key)}
          >
            {key === 'back' ? (
              <Delete className="size-6" aria-hidden />
            ) : key === 'clear' ? (
              <span className="text-base">Hapus</span>
            ) : (
              key
            )}
          </Button>
        ))}
      </div>
    </form>
  );
}
