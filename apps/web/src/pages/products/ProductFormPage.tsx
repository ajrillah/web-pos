import {
  BULK_FACTOR,
  type BulkBaseUnit,
  bulkSellUnit,
  type Category,
  formatInteger,
  formatRupiah,
  formatStockPyramid,
  MAX_PYRAMID_LEVELS,
  type Product,
  type ProductType,
  type UnitMode,
  type UpdateProductRequest,
} from '@toko-podomoro/shared';
import { ArrowLeft, ArrowUp, Plus, Power, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useApproval } from '../../approval/ApprovalProvider';
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
import {
  baseUnitOf,
  checkLevels,
  emptyLevel,
  type LevelDraft,
  levelCosts,
  levelFactors,
  pyramidFromProduct,
  toUnitInputs,
} from './product-units';

/** A row of the flat editor: products from before MS1 whose units are not a pyramid (4.1.1). */
interface UnitDraft {
  key: string;
  id?: string;
  name: string;
  isi: number | null;
  sellPrice: number | null;
  isBase: boolean;
}

interface Draft {
  code: string;
  name: string;
  categoryId: string;
  type: ProductType;
  baseUnit: string;
  /** Pyramid: the cost of one level 1 unit. Flat: the cost per `pricingFactor` base units. */
  costPrice: number | null;
  mode: UnitMode;
  /** Pyramid levels, largest first. */
  levels: LevelDraft[];
  /** Flat unit rows. */
  units: UnitDraft[];
  initialStock: number | null;
}

const newKey = () => crypto.randomUUID();

const unitDrafts = (product: Product): UnitDraft[] =>
  product.units.map((u) => ({
    key: u.id,
    id: u.id,
    name: u.name,
    isi: u.isi,
    sellPrice: u.sellPrice,
    isBase: u.isBase,
  }));

/** The single sell unit of a bulk product: `kg` per gram, `liter` per ml. */
const sellUnitOf = (base: string) => bulkSellUnit[base as BulkBaseUnit] ?? 'kg';

/** Default rows when switching type, or the product's own rows when switching back. */
function unitsFor(type: ProductType, baseUnit: string, product: Product | null): UnitDraft[] {
  if (product && product.type === type) return unitDrafts(product);
  if (type === 'bulk') {
    return [
      {
        key: newKey(),
        name: sellUnitOf(baseUnit),
        isi: BULK_FACTOR,
        sellPrice: null,
        isBase: true,
      },
    ];
  }
  return [{ key: newKey(), name: baseUnit, isi: 1, sellPrice: null, isBase: true }];
}

const emptyDraft = (): Draft => ({
  code: '',
  name: '',
  categoryId: '',
  type: 'unit',
  baseUnit: 'pcs',
  costPrice: null,
  mode: 'pyramid',
  levels: [{ ...emptyLevel(), name: 'pcs' }],
  units: unitsFor('unit', 'pcs', null),
  initialStock: null,
});

function toDraft(product: Product): Draft {
  const levels = pyramidFromProduct(product);
  return {
    code: product.code,
    name: product.name,
    categoryId: product.categoryId,
    type: product.type,
    baseUnit: product.baseUnit,
    // A pyramid prices its level 1 unit; a flat product prices its stock unit.
    costPrice: levels ? (product.units[0]?.costPrice ?? null) : product.costPrice,
    mode: levels ? 'pyramid' : 'flat',
    levels: levels ?? [{ ...emptyLevel(), name: product.baseUnit }],
    units: unitDrafts(product),
    initialStock: null,
  };
}

/** Client-side completeness check; the server validates every rule again. */
function toRequest(draft: Draft): UpdateProductRequest | string {
  if (!draft.code.trim()) return 'Kode barang wajib diisi.';
  if (!draft.name.trim()) return 'Nama barang wajib diisi.';
  if (!draft.categoryId) return 'Pilih kategori.';
  const shared = {
    code: draft.code,
    name: draft.name,
    categoryId: draft.categoryId,
    type: draft.type,
  };
  if (draft.mode === 'pyramid') {
    const problem = checkLevels(draft.costPrice, draft.levels);
    if (problem) return problem;
    return {
      ...shared,
      baseUnit: baseUnitOf(draft.levels),
      unitMode: 'pyramid',
      units: toUnitInputs(draft.costPrice as number, draft.levels),
    };
  }
  if (!draft.baseUnit.trim()) return 'Satuan stok wajib diisi.';
  if (draft.costPrice === null) return 'Harga pokok wajib diisi.';
  const units = [];
  for (const u of draft.units) {
    if (!u.name.trim()) return 'Nama satuan wajib diisi.';
    if (!u.isi) return `Isi satuan "${u.name}" wajib diisi (minimal 1).`;
    if (u.sellPrice === null) return `Harga jual satuan "${u.name}" wajib diisi.`;
    units.push({
      ...(u.id ? { id: u.id } : {}),
      name: u.name,
      isi: u.isi,
      sellPrice: u.sellPrice,
      isBase: u.isBase,
    });
  }
  return {
    ...shared,
    baseUnit: draft.baseUnit,
    unitMode: 'flat',
    costPrice: draft.costPrice,
    units,
  };
}

/** Create (`/barang/baru`) or edit (`/barang/:id`) a product with its unit rows. */
export function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { withApproval } = useApproval();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(id ? null : emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cashiers may edit everything except prices; price changes need owner approval (PIN).
  const needsPinForPrices = product !== null && user.role !== 'owner';
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
  const setLevel = (key: string, patch: Partial<LevelDraft>) =>
    set({ levels: draft.levels.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const isBulk = draft.type === 'bulk';
  const isPyramid = draft.mode === 'pyramid';
  const stockUnit = isPyramid ? baseUnitOf(draft.levels) || 'satuan terkecil' : draft.baseUnit;
  const costUnit = isPyramid
    ? draft.levels[0]?.name.trim() || 'satuan'
    : isBulk
      ? sellUnitOf(draft.baseUnit)
      : draft.baseUnit || 'satuan';
  const costs = levelCosts(draft.costPrice, draft.levels);
  const factors = levelFactors(draft.levels);
  // Active categories, plus the product's current one even if it was deactivated.
  const categoryOptions = categories.filter((c) => c.active || c.id === product?.categoryId);

  const changeType = (type: ProductType) => {
    const baseUnit = product?.type === type ? product.baseUnit : type === 'bulk' ? 'gram' : 'pcs';
    const levels = product?.type === type ? draft.levels : [{ ...emptyLevel(), name: baseUnit }];
    set({
      type,
      baseUnit,
      // Bulk products stay flat: one kg / liter row (docs/design.md 4.1).
      mode: type === 'bulk' ? 'flat' : product && product.type === type ? draft.mode : 'pyramid',
      levels,
      units: unitsFor(type, baseUnit, product),
      costPrice: product?.type === type ? draft.costPrice : null,
    });
  };

  /** Adds a bigger unit above level 1; the old top then needs its own content. */
  const addLevelAbove = () => {
    const [top, ...rest] = draft.levels;
    if (!top) return;
    set({
      levels: [emptyLevel(), { ...top, isi: null }, ...rest],
      // The cost belongs to level 1, which is now a unit nobody has priced yet.
      costPrice: null,
    });
  };

  const addLevelBelow = () => set({ levels: [...draft.levels, emptyLevel()] });

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
        await withApproval('product.price', product.id, (token) =>
          api.updateProduct(product.id, body, token),
        );
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
      const { product: updated } = product.active
        ? await withApproval('product.deactivate', product.id, (token) =>
            api.setProductActive(product.id, false, token),
          )
        : await api.setProductActive(product.id, true);
      setProduct(updated);
      toast.success(
        updated.active ? `${updated.name} diaktifkan.` : `${updated.name} dinonaktifkan.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const deactivateNeedsPin = product?.active === true && user.role !== 'owner';

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
              onClick={() => void toggleActive()}
              className={product.active ? 'text-destructive hover:bg-destructive-soft' : ''}
            >
              <Power className="size-[18px]" aria-hidden />
              {product.active ? 'Nonaktifkan barang' : 'Aktifkan barang'}
              {deactivateNeedsPin && <PinHint />}
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
              uppercase
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
                  <TabsTrigger value="unit" disabled={unitKindLocked} className="flex-1">
                    Satuan
                  </TabsTrigger>
                  <TabsTrigger value="bulk" disabled={unitKindLocked} className="flex-1">
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
              ) : isPyramid ? (
                // The stock unit of a pyramid is its smallest level (docs/design.md 4.1.1).
                <Input id="baseUnit" value={stockUnit} readOnly tabIndex={-1} aria-readonly />
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
                  suffix={stockUnit}
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
              {needsPinForPrices && <PinHint />}
            </div>
            <CardDescription>
              {needsPinForPrices
                ? 'Perubahan harga dan satuan baru memerlukan persetujuan pemilik (PIN).'
                : isBulk
                  ? `Barang curah dijual per ${costUnit}; stok dicatat dalam ${draft.baseUnit}.`
                  : isPyramid
                    ? `Tingkat satuan dari yang terbesar. Isi = jumlah satuan itu dalam satu satuan di atasnya. Stok dihitung dalam ${stockUnit}.`
                    : `Isi = jumlah ${draft.baseUnit || 'satuan stok'} dalam satu satuan jual. Satuan besar dapat dipakai sebagai harga grosir.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPyramid ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[40px_1fr_150px_190px_190px_44px] gap-3 px-1">
                  <span className="label-caps">Tkt</span>
                  <span className="label-caps">Satuan</span>
                  <span className="label-caps text-right">Isi</span>
                  <span className="label-caps text-right">Harga pokok</span>
                  <span className="label-caps text-right">Harga jual</span>
                  <span className="sr-only">Hapus</span>
                </div>
                {draft.levels.map((level, index) => {
                  const above = draft.levels[index - 1];
                  const cost = costs[index];
                  const factor = factors[index] ?? 1;
                  return (
                    <div
                      key={level.key}
                      data-level-row={index}
                      className="grid grid-cols-[40px_1fr_150px_190px_190px_44px] items-center gap-3 rounded-row bg-muted/60 p-1"
                    >
                      <span className="text-center font-semibold text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <div>
                        <Input
                          id={`level-name-${index}`}
                          aria-label={`Nama satuan tingkat ${index + 1}`}
                          value={level.name}
                          onChange={(e) => setLevel(level.key, { name: e.target.value })}
                          placeholder={index === 0 ? 'Ball, Dus, Karung' : 'Slop, Bungkus, pcs'}
                          autoComplete="off"
                        />
                        {factor > 1 && (
                          <span className="block px-1 pt-1 text-sm text-muted-foreground tabular-nums">
                            = {formatInteger(factor)} {stockUnit}
                          </span>
                        )}
                      </div>
                      {index === 0 ? (
                        <span className="pr-3 text-right text-muted-foreground">—</span>
                      ) : (
                        <NumberInput
                          id={`level-isi-${index}`}
                          aria-label={`Isi satuan tingkat ${index + 1}`}
                          value={level.isi}
                          onValueChange={(isi) => setLevel(level.key, { isi })}
                          suffix={`/ ${above?.name.trim() || 'satuan'}`}
                        />
                      )}
                      {index === 0 ? (
                        <NumberInput
                          id="costPrice"
                          aria-label={`Harga pokok per ${costUnit}`}
                          value={draft.costPrice}
                          onValueChange={(costPrice) => set({ costPrice })}
                          prefix="Rp"
                        />
                      ) : (
                        <span className="pr-3 text-right tabular-nums">
                          {formatRupiah(cost?.cost ?? 0)}
                          {cost?.rounded && (
                            <span className="block text-sm text-muted-foreground">
                              (dibulatkan)
                            </span>
                          )}
                        </span>
                      )}
                      <NumberInput
                        id={`level-price-${index}`}
                        aria-label={`Harga jual satuan tingkat ${index + 1}`}
                        value={level.sellPrice}
                        onValueChange={(sellPrice) => setLevel(level.key, { sellPrice })}
                        prefix="Rp"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Hapus satuan ${level.name || index + 1}`}
                        // Only the smallest level can go: the levels above it count on it.
                        disabled={draft.levels.length === 1 || index !== draft.levels.length - 1}
                        onClick={() => set({ levels: draft.levels.slice(0, -1) })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-[18px]" aria-hidden />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={draft.levels.length >= MAX_PYRAMID_LEVELS}
                    onClick={addLevelAbove}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                    Tambah satuan lebih besar
                    {needsPinForPrices && <PinHint />}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={draft.levels.length >= MAX_PYRAMID_LEVELS || unitKindLocked}
                    onClick={addLevelBelow}
                  >
                    <Plus className="size-4" aria-hidden />
                    Tambah satuan lebih kecil
                    {needsPinForPrices && <PinHint />}
                  </Button>
                </div>
                {unitKindLocked && (
                  <p className="text-sm text-muted-foreground">
                    Satuan yang lebih kecil tidak dapat ditambahkan karena stok sudah dihitung dalam{' '}
                    {stockUnit}.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="costPrice">Harga pokok per {costUnit}</Label>
                  <NumberInput
                    id="costPrice"
                    value={draft.costPrice}
                    onValueChange={(costPrice) => set({ costPrice })}
                    prefix="Rp"
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
                        id={`unit-isi-${index}`}
                        aria-label={`Isi satuan ${index + 1}`}
                        value={unit.isi}
                        onValueChange={(isi) => setUnit(unit.key, { isi })}
                        suffix={draft.baseUnit}
                        disabled={isBulk}
                      />
                      <NumberInput
                        id={`unit-price-${index}`}
                        aria-label={`Harga jual satuan ${index + 1}`}
                        value={unit.sellPrice}
                        onValueChange={(sellPrice) => setUnit(unit.key, { sellPrice })}
                        prefix="Rp"
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
                      onClick={() =>
                        set({
                          units: [
                            ...draft.units,
                            { key: newKey(), name: '', isi: null, sellPrice: null, isBase: false },
                          ],
                        })
                      }
                    >
                      <Plus className="size-4" aria-hidden />
                      Tambah satuan
                      {needsPinForPrices && <PinHint />}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {product && (
          <p className="text-muted-foreground tabular-nums">
            Stok saat ini: {formatStockPyramid(product.stock, product.unitChain, product.baseUnit)}.
            Stok diubah lewat menu Stok.
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
