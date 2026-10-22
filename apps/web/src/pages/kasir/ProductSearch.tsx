import { formatInteger, formatRupiah, type Product } from '@toko-podomoro/shared';
import { Search } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';
import { ApiRequestError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { Kbd } from '../../components/ui/kbd';
import { cn } from '../../lib/utils';
import { primaryUnit } from './cart';

const RESULT_LIMIT = 8;

/**
 * Kasir search (60px, F2). Typing lists matches by code or name; Enter adds the exact code
 * (barcode scanners type the code + Enter) or else the highlighted match.
 */
export function ProductSearch({
  inputRef,
  onPick,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (product: Product) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      api
        .listProducts({ q, limit: RESULT_LIMIT })
        .then((r) => {
          if (!current) return;
          setResults(r.products);
          setHighlight(0);
        })
        .catch((err: unknown) => current && setMessage(errorMessage(err)));
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
    setMessage(null);
  }

  async function submit() {
    const q = query.trim();
    if (!q) return;
    try {
      pick((await api.productByCode(q)).product);
      return;
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.code === 'PRODUCT_NOT_FOUND')) {
        setMessage(errorMessage(err));
        return;
      }
    }
    const listed = results ?? (await api.listProducts({ q, limit: RESULT_LIMIT })).products;
    const chosen = listed[Math.min(highlight, listed.length - 1)];
    if (chosen) pick(chosen);
    else setMessage('Barang tidak ditemukan');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'ArrowDown' && results?.length) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results?.length) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape' && (query || results)) {
      // Clears the search first; a second Esc reaches Kasir (Batal).
      e.stopPropagation();
      setQuery('');
      setResults(null);
      setMessage(null);
    }
  }

  const open = results !== null && query.trim() !== '';

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-5 size-6 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        data-search-input
        id="kasir-search"
        aria-label="Cari barang (kode atau nama)"
        placeholder="Scan atau ketik kode / nama barang"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="kasir-search-results"
        aria-activedescendant={open && results.length > 0 ? `kasir-result-${highlight}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setMessage(null);
        }}
        onKeyDown={onKeyDown}
        className="h-[60px] w-full rounded-control border border-input bg-card pr-16 pl-14 text-[20px] outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary-soft"
      />
      <Kbd className="absolute top-1/2 right-4 h-7 -translate-y-1/2 px-2 text-sm text-muted-foreground">
        F2
      </Kbd>
      {message && (
        <p role="alert" className="mt-2 px-1 font-semibold text-destructive">
          {message}
        </p>
      )}
      {open && (
        <div
          id="kasir-search-results"
          role="listbox"
          className="absolute top-[68px] right-0 left-0 z-30 max-h-[420px] overflow-y-auto rounded-[20px] border border-border bg-popover p-1.5 shadow-card"
        >
          {results.length === 0 && (
            <p className="px-4 py-3 font-semibold text-destructive">Barang tidak ditemukan</p>
          )}
          {results.map((product, index) => {
            const unit = primaryUnit(product);
            return (
              <div
                key={product.id}
                id={`kasir-result-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlight}
                data-code={product.code}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(product);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 rounded-row px-4 py-2.5',
                  index === highlight && 'bg-selected',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-mono">{product.code}</span> · {product.categoryName}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-[17px] font-semibold">
                    {unit ? `${formatRupiah(unit.sellPrice)} / ${unit.name}` : '—'}
                  </div>
                  <div
                    className={cn(
                      'text-sm',
                      product.stock <= 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    Stok {formatInteger(product.stock)} {product.baseUnit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
