import { formatRupiah, type Supplier } from '@toko-podomoro/shared';
import { Search, Truck } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { cn } from '../../lib/utils';

const LIMIT = 8;

/**
 * Finds an active supplier by name or phone. Arrow keys move, Enter picks. When nothing
 * matches, Enter offers a quick add with the typed name.
 */
export function SupplierPicker({
  onPick,
  autoFocus = false,
  withBalance = false,
}: {
  onPick: (supplier: Supplier) => void;
  autoFocus?: boolean;
  /** Only suppliers with debt (no quick add). */
  withBalance?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Supplier[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api
        .listSuppliers({
          q: query.trim() || undefined,
          limit: LIMIT,
          ...(withBalance ? { withBalance: 'true' } : {}),
        })
        .then((r) => {
          if (!current) return;
          setResults(r.suppliers);
          setHighlight(0);
        })
        .catch((err: unknown) => current && setError(errorMessage(err)));
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, withBalance]);

  const name = withBalance ? '' : query.trim();
  // The quick-add row comes after the matches.
  const options = results.length + (name ? 1 : 0);

  async function quickAdd() {
    try {
      onPick((await api.createSupplier({ name })).supplier);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function choose(index: number) {
    const supplier = results[index];
    if (supplier) onPick(supplier);
    else if (name) void quickAdd();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options > 0) choose(highlight);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id="supplier-search"
          aria-label="Cari pemasok"
          placeholder="Nama atau no. HP pemasok"
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls="supplier-results"
          aria-activedescendant={options > 0 ? `supplier-option-${highlight}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          // biome-ignore lint/a11y/noAutofocus: the picker is shown to be typed into.
          autoFocus={autoFocus}
          className="h-12 w-full rounded-control border border-input bg-card pr-4 pl-12 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
        />
      </div>
      <div id="supplier-results" role="listbox" className="max-h-64 space-y-0.5 overflow-y-auto">
        {results.map((supplier, index) => (
          <div
            key={supplier.id}
            id={`supplier-option-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === highlight}
            data-supplier={supplier.name}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(supplier);
            }}
            onMouseEnter={() => setHighlight(index)}
            className={cn(
              'flex cursor-pointer items-center justify-between rounded-row px-3 py-2',
              index === highlight && 'bg-selected',
            )}
          >
            <span>
              <span className="font-semibold">{supplier.name}</span>
              {supplier.phone && (
                <span className="ml-2 text-sm text-muted-foreground">{supplier.phone}</span>
              )}
            </span>
            {supplier.balance > 0 && (
              <span className="text-sm font-semibold text-warning-foreground tabular-nums">
                Hutang {formatRupiah(supplier.balance)}
              </span>
            )}
          </div>
        ))}
        {withBalance && results.length === 0 && (
          <p className="px-3 py-2 text-muted-foreground">Tidak ada pemasok dengan hutang.</p>
        )}
        {name && (
          <div
            id={`supplier-option-${results.length}`}
            role="option"
            tabIndex={-1}
            aria-selected={highlight === results.length}
            onMouseDown={(e) => {
              e.preventDefault();
              void quickAdd();
            }}
            onMouseEnter={() => setHighlight(results.length)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-row px-3 py-2 font-semibold text-primary',
              highlight === results.length && 'bg-selected',
            )}
          >
            <Truck className="size-4" aria-hidden />
            Tambah pemasok baru “{name}”
          </div>
        )}
      </div>
      <ErrorAlert message={error} />
    </div>
  );
}
