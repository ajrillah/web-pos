import { Lock } from 'lucide-react';

/** Gold "PIN" marker on items a cashier can open only with owner approval. */
export function PinHint() {
  return (
    <span
      title="Perlu PIN pemilik"
      className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-1.5 py-px text-[11px] font-bold text-warning-foreground"
    >
      <Lock className="size-3" aria-hidden />
      PIN
    </span>
  );
}
