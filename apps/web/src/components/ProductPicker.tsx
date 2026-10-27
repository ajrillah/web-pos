import type { Product } from '@toko-podomoro/shared';
import { Search } from 'lucide-react';
import { type KeyboardEvent, type Ref, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { formatQty } from '../lib/format';
import { cn } from '../lib/utils';
import { ErrorAlert } from './forms';

const LIMIT = 8;

/**
 * Finds an active product by code or name. Arrow keys move, Enter picks (an exact code match
 * is listed first). The field clears after a pick so the next product can be typed.
 */
export function ProductPicker({
  id = 'product-search',
  onPick,
  autoFocus = false,
  placeholder = 'Kode atau nama barang',
  inputRef,
}: {
  id?: string;
  onPick: (product: Product) => void;
  autoFocus?: boolean;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      api
        .listProducts({ q, limit: LIMIT })
        .then((r) => {
          if (!current) return;
          setResults(r.products);
          setHighlight(0);
          setError(null);
        })
        .catch((err: unknown) => current && setError(errorMessage(err)));
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  function pick(product: Product) {
    onPick(product);
    setQuery('');
    setResults(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const count = results?.length ?? 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results?.[highlight];
      if (chosen) pick(chosen);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    }
  }

  const listId = `${id}-results`;
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-6 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        id={id}
        data-search-input
        aria-label="Cari barang"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={results !== null}
        aria-controls={listId}
        aria-activedescendant={results?.length ? `${listId}-${highlight}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        // biome-ignore lint/a11y/noAutofocus: the picker is the first field of its form.
        autoFocus={autoFocus}
        className="h-12 w-full rounded-control border border-input bg-card pr-4 pl-12 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
      />
      {results !== null && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 space-y-0.5 overflow-y-auto rounded-card border border-border bg-popover p-2 shadow-card"
        >
          {results.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground">Barang tidak ditemukan</p>
          )}
          {results.map((product, index) => (
            <div
              key={product.id}
              id={`${listId}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === highlight}
              data-product={product.code}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(product);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-4 rounded-row px-3 py-2',
                index === highlight && 'bg-selected',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{product.name}</span>
                <span className="block text-sm text-muted-foreground">
                  <span className="font-mono">{product.code}</span> · {product.categoryName}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm tabular-nums',
                  product.stock < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground',
                )}
              >
                {formatQty(product.stock, product.baseUnit, product.unitChain)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 empty:hidden">
        <ErrorAlert message={error} />
      </div>
    </div>
  );
}
