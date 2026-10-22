import { type Customer, formatRupiah } from '@toko-podomoro/shared';
import { Search, UserPlus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { ErrorAlert } from '../../components/forms';
import { cn } from '../../lib/utils';

const LIMIT = 8;

/**
 * Finds an active customer by name or phone. Arrow keys move, Enter picks. When nothing
 * matches, Enter offers a quick add with the typed name (cashiers may add customers).
 */
export function CustomerPicker({
  onPick,
  autoFocus = false,
}: {
  onPick: (customer: Customer) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api
        .listCustomers({ q: query.trim() || undefined, limit: LIMIT })
        .then((r) => {
          if (!current) return;
          setResults(r.customers);
          setHighlight(0);
        })
        .catch((err: unknown) => current && setError(errorMessage(err)));
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const name = query.trim();
  // The quick-add row comes after the matches.
  const options = results.length + (name ? 1 : 0);

  async function quickAdd() {
    try {
      onPick((await api.createCustomer({ name })).customer);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function choose(index: number) {
    const customer = results[index];
    if (customer) onPick(customer);
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
          id="customer-search"
          aria-label="Cari pelanggan"
          placeholder="Nama atau no. HP pelanggan"
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls="customer-results"
          aria-activedescendant={options > 0 ? `customer-option-${highlight}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          // biome-ignore lint/a11y/noAutofocus: the picker opens inside a dialog to be typed into.
          autoFocus={autoFocus}
          className="h-12 w-full rounded-control border border-input bg-card pr-4 pl-12 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
        />
      </div>
      <div id="customer-results" role="listbox" className="max-h-64 space-y-0.5 overflow-y-auto">
        {results.map((customer, index) => (
          <div
            key={customer.id}
            id={`customer-option-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === highlight}
            data-customer={customer.name}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(customer);
            }}
            onMouseEnter={() => setHighlight(index)}
            className={cn(
              'flex cursor-pointer items-center justify-between rounded-row px-3 py-2',
              index === highlight && 'bg-selected',
            )}
          >
            <span>
              <span className="font-semibold">{customer.name}</span>
              {customer.phone && (
                <span className="ml-2 text-sm text-muted-foreground">{customer.phone}</span>
              )}
            </span>
            {customer.balance > 0 && (
              <span className="text-sm font-semibold text-warning-foreground tabular-nums">
                Kasbon {formatRupiah(customer.balance)}
              </span>
            )}
          </div>
        ))}
        {name && (
          <div
            id={`customer-option-${results.length}`}
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
            <UserPlus className="size-4" aria-hidden />
            Tambah pelanggan baru “{name}”
          </div>
        )}
      </div>
      <ErrorAlert message={error} />
    </div>
  );
}
