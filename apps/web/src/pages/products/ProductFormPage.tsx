import {
  BULK_FACTOR,
  type BulkBaseUnit,
  bulkSellUnit,
  type Category,
  formatInteger,
  type Product,
  type ProductType,
  type UpdateProductRequest,
} from '@toko-podomoro/shared';
import { ArrowLeft, Plus, Power, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useCurrentUser } from '../../auth/AuthProvider';
import { ErrorAlert, TextField } from '../../components/forms';
import { NumberInput } from '../../components/NumberInput';
import { PinHint } from '../../components/PinHint';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { PageHeader } from '../../layout/PageHeader';

interface UnitDraft {
  key: string;
  id?: string;
  name: string;
  factor: number | null;
  sellPrice: number | null;
  isBase: boolean;
}

interface Draft {
  code: string;
  name: string;
  categoryId: string;
  type: ProductType;
  baseUnit: string;
  costPrice: number | null;
  units: UnitDraft[];
  initialStock: number | null;
}

const newKey = () => crypto.randomUUID();

const unitDrafts = (product: Product): UnitDraft[] =>
  product.units.map((u) => ({
    key: u.id,
    id: u.id,
    name: u.name,
    factor: u.factor,
    sellPrice: u.sellPrice,
    isBase: u.isBase,
  }));

/** Default rows when switching type, or the product's own rows when switching back. */
function unitsFor(type: ProductType, baseUnit: string, product: Product | null): UnitDraft[] {
  if (product && product.type === type) return unitDrafts(product);
  if (type === 'bulk') {
    const name = bulkSellUnit[baseUnit as BulkBaseUnit] ?? 'kg';
    return [{ key: newKey(), name, factor: BULK_FACTOR, sellPrice: null, isBase: true }];
  }
  return [{ key: newKey(), name: baseUnit, factor: 1, sellPrice: null, isBase: true }];
}

const emptyDraft = (): Draft => ({
  code: '',
  name: '',
  categoryId: '',
  type: 'unit',
  baseUnit: 'pcs',
  costPrice: null,
  units: unitsFor('unit', 'pcs', null),
  initialStock: null,
});

const toDraft = (product: Product): Draft => ({
  code: product.code,
  name: product.name,
  categoryId: product.categoryId,
  type: product.type,
  baseUnit: product.baseUnit,
  costPrice: product.costPrice,
  units: unitDrafts(product),
  initialStock: null,
});

/** Client-side completeness check; the server validates every rule again. */
function toRequest(draft: Draft): UpdateProductRequest | string {
  if (!draft.code.trim()) return 'Kode barang wajib diisi.';
  if (!draft.name.trim()) return 'Nama barang wajib diisi.';
  if (!draft.categoryId) return 'Pilih kategori.';
  if (!draft.baseUnit.trim()) return 'Satuan stok wajib diisi.';
  if (draft.costPrice === null) return 'Harga pokok wajib diisi.';
  const units = [];
  for (const u of draft.units) {
    if (!u.name.trim()) return 'Nama satuan wajib diisi.';
    if (!u.factor) return `Isi satuan "${u.name}" wajib diisi (minimal 1).`;
    if (u.sellPrice === null) return `Harga jual satuan "${u.name}" wajib diisi.`;
    units.push({
      ...(u.id ? { id: u.id } : {}),
      name: u.name,
      factor: u.factor,
      sellPrice: u.sellPrice,
      isBase: u.isBase,
    });
  }
  return {
    code: draft.code,
    name: draft.name,
    categoryId: draft.categoryId,
    type: draft.type,
    baseUnit: draft.baseUnit,
    costPrice: draft.costPrice,
    units,
  };
}

/** Create (`/barang/baru`) or edit (`/barang/:id`) a product with its unit rows. */
export function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(id ? null : emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cashiers may edit everything except prices; price changes need owner approval (PIN).
  const pricesLocked = product !== null && user.role !== 'owner';
  // Stock is counted in the current unit, so type and stock unit kind are fixed once it moved.
  const unitKindLocked = product?.hasStockMovements === true;

  useEffect(() => {
    api
      .listCategories()
      .then((r) => setCategories(r.categories))
      .catch((err: unknown) => setError(errorMessage(err)));
    if (id) {
      api
        .getProduct(id)
        .then(({ product: p }) => {
          setProduct(p);
          setDraft(toDraft(p));
        })
        .catch((err: unknown) => setError(errorMessage(err)));
    }
  }, [id]);

  if (!draft) {
    return (
      <section>
        <PageHeader title="Ubah barang" />
        {error ? <ErrorAlert message={error} /> : <p className="text-muted-foreground">Memuat…</p>}
      </section>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setUnit = (key: string, patch: Partial<UnitDraft>) =>
    set({ units: draft.units.map((u) => (u.key === key ? { ...u, ...patch } : u)) });
  const isBulk = draft.type === 'bulk';
  const sellUnitOf = (base: string) => bulkSellUnit[base as BulkBaseUnit] ?? 'kg';
  const costUnit = isBulk ? sellUnitOf(draft.baseUnit) : draft.baseUnit || 'satuan';
  // Active categories, plus the product's current one even if it was deactivated.
  const categoryOptions = categories.filter((c) => c.active || c.id === product?.categoryId);

  function changeType(type: ProductType) {
    const baseUnit = product?.type === type ? product.baseUnit : type === 'bulk' ? 'gram' : 'pcs';
    set({ type, baseUnit, units: unitsFor(type, baseUnit, product) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const body = toRequest(draft);
    if (typeof body === 'string') {
      setError(body);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (product) {
        await api.updateProduct(product.id, body);
        toast.success(`${body.name} disimpan.`);
      } else {
        await api.createProduct({ ...body, initialStock: draft.initialStock ?? 0 });
        toast.success(`${body.name} ditambahkan.`);
      }
      navigate('/barang');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!product) return;
    try {
      const { product: updated } = await api.setProductActive(product.id, !product.active);
      setProduct(updated);
      toast.success(
        updated.active ? `${updated.name} diaktifkan.` : `${updated.name} dinonaktifkan.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const deactivateLocked = product?.active === true && user.role !== 'owner';

  return (
    <section className="max-w-4xl">
      <Link
        to="/barang"
        className="mb-3 inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Daftar barang
      </Link>
      <PageHeader
        title={product ? 'Ubah barang' : 'Tambah barang'}
        description={product ? <span className="font-mono">{product.code}</span> : undefined}
        actions={
          product && (
            <Button
              variant="ghost"
              onClick={deactivateLocked ? undefined : () => void toggleActive()}
              aria-disabled={deactivateLocked || undefined}
              className={
                product.active
                  ? 'text-destructive hover:bg-destructive-soft aria-disabled:cursor-not-allowed aria-disabled:opacity-60'
                  : ''
              }
            >
              <Power className="size-[18px]" aria-hidden />
              {product.active ? 'Nonaktifkan barang' : 'Aktifkan barang'}
              {deactivateLocked && <PinHint />}
            </Button>
          )
        }
      />

      <form onSubmit={submit} className="space-y-5" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Data barang</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4">
            <TextField
              id="code"
              label="Kode barang"
              value={draft.code}
              onChange={(e) => set({ code: e.target.value })}
              autoFocus={!product}
              autoComplete="off"
              className="[&_input]:font-mono"
            />
            <TextField
              id="name"
              label="Nama barang"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              autoComplete="off"
            />
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategori</Label>
              <Select value={draft.categoryId} onValueChange={(v) => set({ categoryId: v })}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label id="type-label">Jenis</Label>
              <Tabs value={draft.type} onValueChange={(v) => changeType(v as ProductType)}>
                <TabsList aria-labelledby="type-label" className="flex w-full">
                  <TabsTrigger
                    value="unit"
                    disabled={pricesLocked || unitKindLocked}
                    className="flex-1"
                  >
                    Satuan
                  </TabsTrigger>
                  <TabsTrigger
                    value="bulk"
                    disabled={pricesLocked || unitKindLocked}
                    className="flex-1"
                  >
                    Curah (timbang)
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baseUnit">Satuan stok</Label>
              {isBulk ? (
                <Select
                  disabled={unitKindLocked}
                  value={draft.baseUnit}
                  onValueChange={(baseUnit) =>
                    set({
                      baseUnit,
                      units: draft.units.map((u) => ({ ...u, name: sellUnitOf(baseUnit) })),
                    })
                  }
                >
                  <SelectTrigger id="baseUnit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gram">gram (dijual per kg)</SelectItem>
                    <SelectItem value="ml">ml (dijual per liter)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="baseUnit"
                  value={draft.baseUnit}
                  onChange={(e) => set({ baseUnit: e.target.value })}
                  placeholder="pcs, batang, sachet"
                  autoComplete="off"
                />
              )}
            </div>
            {unitKindLocked && (
              <p className="col-span-2 text-sm text-muted-foreground">
                Jenis dan satuan stok terkunci karena barang ini sudah punya riwayat stok. Untuk
                menggantinya, nonaktifkan barang ini lalu buat barang baru.
              </p>
            )}
            {!product && (
              <div className="space-y-1.5">
                <Label htmlFor="initialStock">Stok awal</Label>
                <NumberInput
                  id="initialStock"
                  value={draft.initialStock}
                  onValueChange={(initialStock) => set({ initialStock })}
                  suffix={draft.baseUnit}
                  placeholder="0"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Satuan dan harga</CardTitle>
              {pricesLocked && <PinHint />}
            </div>
            <CardDescription>
              {pricesLocked
                ? 'Perubahan harga dan satuan baru memerlukan persetujuan pemilik (PIN).'
                : isBulk
                  ? `Barang curah dijual per ${costUnit}; stok dicatat dalam ${draft.baseUnit}.`
                  : `Isi = jumlah ${draft.baseUnit || 'satuan stok'} dalam satu satuan jual. Satuan besar dapat dipakai sebagai harga grosir.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="costPrice">Harga pokok per {costUnit}</Label>
              <NumberInput
                id="costPrice"
                value={draft.costPrice}
                onValueChange={(costPrice) => set({ costPrice })}
                prefix="Rp"
                disabled={pricesLocked}
              />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_190px_200px_80px_44px] gap-3 px-1">
                <span className="label-caps">Satuan jual</span>
                <span className="label-caps text-right">Isi</span>
                <span className="label-caps text-right">Harga jual</span>
                <span className="label-caps text-center">Utama</span>
                <span className="sr-only">Hapus</span>
              </div>
              {draft.units.map((unit, index) => (
                <div
                  key={unit.key}
                  data-unit-row={index}
                  className="grid grid-cols-[1fr_190px_200px_80px_44px] items-center gap-3 rounded-row bg-muted/60 p-1"
                >
                  <Input
                    id={`unit-name-${index}`}
                    aria-label={`Nama satuan ${index + 1}`}
                    value={unit.name}
                    onChange={(e) => setUnit(unit.key, { name: e.target.value })}
                    disabled={isBulk}
                    autoComplete="off"
                  />
                  <NumberInput
                    id={`unit-factor-${index}`}
                    aria-label={`Isi satuan ${index + 1}`}
                    value={unit.factor}
                    onValueChange={(factor) => setUnit(unit.key, { factor })}
                    suffix={draft.baseUnit}
                    disabled={isBulk}
                  />
                  <NumberInput
                    id={`unit-price-${index}`}
                    aria-label={`Harga jual satuan ${index + 1}`}
                    value={unit.sellPrice}
                    onValueChange={(sellPrice) => setUnit(unit.key, { sellPrice })}
                    prefix="Rp"
                    disabled={pricesLocked && unit.id !== undefined}
                  />
                  <div className="flex justify-center">
                    <input
                      type="radio"
                      name="primary-unit"
                      aria-label={`Satuan utama: ${unit.name || index + 1}`}
                      checked={unit.isBase}
                      onChange={() =>
                        set({
                          units: draft.units.map((u) => ({ ...u, isBase: u.key === unit.key })),
                        })
                      }
                      disabled={isBulk}
                      className="size-5 accent-primary"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus satuan ${unit.name || index + 1}`}
                    disabled={isBulk || draft.units.length === 1}
                    onClick={() => {
                      // Removing the primary row makes the first remaining row primary.
                      const rest = draft.units.filter((u) => u.key !== unit.key);
                      set({
                        units: rest.map((u, i) =>
                          unit.isBase && i === 0 ? { ...u, isBase: true } : u,
                        ),
                      });
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-[18px]" aria-hidden />
                  </Button>
                </div>
              ))}
              {!isBulk && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pricesLocked}
                  onClick={() =>
                    set({
                      units: [
                        ...draft.units,
                        { key: newKey(), name: '', factor: null, sellPrice: null, isBase: false },
                      ],
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  Tambah satuan
                  {pricesLocked && <PinHint />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {product && (
          <p className="text-muted-foreground tabular-nums">
            Stok saat ini: {formatInteger(product.stock)} {product.baseUnit}. Stok diubah lewat menu
            Stok.
          </p>
        )}

        <ErrorAlert message={error} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" asChild>
            <Link to="/barang">Batal</Link>
          </Button>
          <Button type="submit" disabled={busy} className="min-w-40">
            {busy ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </form>
    </section>
  );
}
