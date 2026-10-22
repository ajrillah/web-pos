import { Store } from 'lucide-react';
import { cn } from '../lib/utils';

/** Logo + store name. The store name becomes a setting (`store_name`) in Stage 5. */
export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 whitespace-nowrap', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground',
          compact ? 'size-9' : 'size-10',
        )}
      >
        <Store className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span
          className={cn('block font-bold', compact ? 'text-sm' : 'text-[15px] tracking-[0.04em]')}
        >
          TOKO PODOMORO
        </span>
        <span className="label-caps block text-[10px]">Kasir toko kelontong</span>
      </span>
    </div>
  );
}
