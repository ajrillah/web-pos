import {
  BULK_FACTOR,
  type BulkBaseUnit,
  bulkSellUnit,
  type CreateProductInput,
  createProductRequestSchema,
  IMPORT_COLUMNS,
  IMPORT_TYPE_VALUES,
  type ImportColumn,
  type ImportCommitResponse,
  type ImportedProduct,
  type ImportPreviewResponse,
  type ImportRequest,
  type ImportRow,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MAX_MONEY,
  MAX_QTY,
  MAX_UNIT_FACTOR,
  OPTIONAL_IMPORT_COLUMNS,
  type ProductUnitInput,
  productCodeSchema,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { AppError } from '../errors';
import { listCategories } from '../repositories/categories-repository';
import { listProductCodes } from '../repositories/products-repository';
import type { Actor, ServiceContext } from './context';
import { type ImportTable, importFileInvalid, importFormatOf, readImportFile } from './import-file';
import { insertNewProduct } from './product-service';

// Product import (docs/design.md 6.5 "Import"): new products only, all-or-nothing per file.

const STOCK_NOTE = 'Stok awal (impor)';

/** Stock units accepted for bulk products, as written in the file. */
const BULK_BASE_ALIASES: Record<string, BulkBaseUnit> = {
  gram: 'gram',
  g: 'gram',
  gr: 'gram',
  ml: 'ml',
};

const importHasErrors = (invalid: number) =>
  new AppError(
    400,
    'IMPORT_HAS_ERRORS',
    `Ada ${invalid} baris bermasalah. Tidak ada barang yang disimpan. Perbaiki file lalu unggah ulang.`,
  );

/**
 * Whole Rupiah or quantity: plain digits, or digits with dot thousands separators (`12.500`).
 * `undefined` when blank, `null` when not a whole number.
 */
export function parseWholeNumber(raw: string): number | null | undefined {
  const text = raw.replace(/\s/g, '');
  if (text === '') return undefined;
  if (/^\d+$/.test(text) || /^\d{1,3}(\.\d{3})+$/.test(text)) {
    const value = Number(text.replaceAll('.', ''));
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}

interface CheckedRow {
  row: ImportRow;
  input: CreateProductInput | null;
}

interface Lookups {
  categories: Map<string, { id: string; name: string; active: boolean }>;
  codes: Set<string>;
}

function loadLookups(db: Executor): Lookups {
  return {
    categories: new Map(listCategories(db).map((c) => [c.name.toLowerCase(), c])),
    codes: new Set(listProductCodes(db).map((c) => c.toLowerCase())),
  };
}

/** Header check: every required column present; extra columns are ignored. */
function columnIndexes(header: string[]): Map<ImportColumn, number> {
  const indexes = new Map<ImportColumn, number>();
  for (const column of IMPORT_COLUMNS) {
    const i = header.indexOf(column);
    if (i >= 0) indexes.set(column, i);
  }
  const missing = IMPORT_COLUMNS.filter(
    (c) => !indexes.has(c) && !OPTIONAL_IMPORT_COLUMNS.includes(c),
  );
  if (missing.length > 0) {
    throw importFileInvalid(
      `Kolom wajib tidak ditemukan di baris pertama: ${missing.join(', ')}. Gunakan template impor.`,
    );
  }
  return indexes;
}

function checkRow(
  values: Record<ImportColumn, string>,
  rowNumber: number,
  lookups: Lookups,
  seenCodes: Map<string, number>,
): CheckedRow {
  const errors: string[] = [];

  const whole = (column: ImportColumn, label: string, max: number, required: boolean) => {
    const value = parseWholeNumber(values[column]);
    if (value === undefined) {
      if (required) errors.push(`${label} wajib diisi.`);
      return undefined;
    }
    if (value === null || value > max) {
      errors.push(`${label} harus bilangan bulat 0 sampai ${max.toLocaleString('id-ID')}.`);
      return undefined;
    }
    return value;
  };
  const unitName = (raw: string, label: string) => {
    if (raw === '') {
      errors.push(`${label} wajib diisi.`);
      return undefined;
    }
    if (raw.length > 20) {
      errors.push(`${label} paling banyak 20 karakter.`);
      return undefined;
    }
    return raw;
  };

  // Code: valid, not in the database (any status), not repeated in the file.
  const code = productCodeSchema.safeParse(values.kode);
  if (values.kode === '') {
    errors.push('Kode wajib diisi.');
  } else if (!code.success) {
    errors.push('Kode hanya boleh berisi huruf, angka, dan . _ / - tanpa spasi (maks 32).');
  } else {
    const key = code.data.toLowerCase();
    const earlier = seenCodes.get(key);
    if (lookups.codes.has(key)) {
      errors.push('Kode sudah dipakai barang lain (termasuk barang nonaktif).');
    } else if (earlier !== undefined) {
      errors.push(`Kode sama dengan baris ${earlier}.`);
    } else {
      seenCodes.set(key, rowNumber);
    }
  }

  const name = values.nama;
  if (name === '') errors.push('Nama wajib diisi.');
  else if (name.length > 100) errors.push('Nama paling banyak 100 karakter.');

  const category = lookups.categories.get(values.kategori.toLowerCase());
  if (values.kategori === '') {
    errors.push('Kategori wajib diisi.');
  } else if (!category) {
    errors.push(`Kategori "${values.kategori}" tidak ada. Tambahkan dulu di Barang > Kategori.`);
  } else if (!category.active) {
    errors.push(`Kategori "${category.name}" nonaktif.`);
  }

  const jenis = values.jenis.toLowerCase();
  const type = Object.hasOwn(IMPORT_TYPE_VALUES, jenis)
    ? IMPORT_TYPE_VALUES[jenis as keyof typeof IMPORT_TYPE_VALUES]
    : undefined;
  if (!type) errors.push('Jenis harus "satuan" atau "curah".');

  const costPrice = whole('harga_pokok', 'Harga pokok', MAX_MONEY, true);
  const sellPrice = whole('harga_jual', 'Harga jual', MAX_MONEY, true);
  const initialStock = whole('stok_awal', 'Stok awal', MAX_QTY, false) ?? 0;

  let baseUnit: string | undefined;
  const units: ProductUnitInput[] = [];
  const extras = [2, 3].map((n) => ({
    n,
    name: values[`satuan${n}_nama` as ImportColumn],
    factor: values[`satuan${n}_isi` as ImportColumn],
    price: values[`satuan${n}_harga` as ImportColumn],
  }));
  const usedExtras = extras.filter((e) => e.name !== '' || e.factor !== '' || e.price !== '');

  if (type === 'bulk') {
    const bulkBase = BULK_BASE_ALIASES[values.satuan_stok.toLowerCase()];
    if (!bulkBase) errors.push('Satuan stok barang curah harus gram atau ml.');
    else baseUnit = bulkBase;
    const sellUnit = bulkBase ? bulkSellUnit[bulkBase] : undefined;
    if (sellUnit && values.satuan_jual !== '' && values.satuan_jual.toLowerCase() !== sellUnit) {
      errors.push(`Satuan jual barang curah harus ${sellUnit} (atau kosongkan).`);
    }
    if (usedExtras.length > 0) errors.push('Barang curah tidak boleh punya satuan tambahan.');
    // Same as manual creation: one kg/liter row, factor 1000, primary (docs/design.md 4.1).
    if (sellUnit && sellPrice !== undefined) {
      units.push({ name: sellUnit, isi: BULK_FACTOR, sellPrice, isBase: true });
    }
  } else if (type === 'unit') {
    baseUnit = unitName(values.satuan_stok, 'Satuan stok');
    if (baseUnit && BULK_BASE_ALIASES[baseUnit.toLowerCase()]) {
      errors.push('Satuan stok gram atau ml hanya untuk barang curah.');
    }
    const primary = unitName(values.satuan_jual, 'Satuan jual');
    if (primary && sellPrice !== undefined) {
      units.push({ name: primary, isi: 1, sellPrice, isBase: true });
    }
    for (const extra of usedExtras) {
      const label = `Satuan ${extra.n}`;
      if (extra.name === '' || extra.factor === '' || extra.price === '') {
        errors.push(`${label}: isi nama, isi, dan harga.`);
        continue;
      }
      const extraName = unitName(extra.name, `${label}: nama`);
      const factor = parseWholeNumber(extra.factor);
      const price = parseWholeNumber(extra.price);
      if (!factor || factor > MAX_UNIT_FACTOR) {
        errors.push(
          `${label}: isi harus bilangan bulat 1 sampai ${MAX_UNIT_FACTOR.toLocaleString('id-ID')}.`,
        );
      }
      if (price === null || price === undefined || price > MAX_MONEY) {
        errors.push(
          `${label}: harga harus bilangan bulat 0 sampai ${MAX_MONEY.toLocaleString('id-ID')}.`,
        );
      }
      if (extraName && factor && price !== null && price !== undefined) {
        units.push({ name: extraName, isi: factor, sellPrice: price, isBase: false });
      }
    }
    const names = units.map((u) => u.name.toLowerCase());
    if (new Set(names).size !== names.length) errors.push('Nama satuan jual tidak boleh sama.');
  }

  let input: CreateProductInput | null = null;
  let product: ImportedProduct | null = null;
  if (errors.length === 0 && type && baseUnit && category && costPrice !== undefined) {
    // Final gate: the same schema as manual creation.
    const parsed = createProductRequestSchema.safeParse({
      code: values.kode,
      name,
      categoryId: category.id,
      type,
      baseUnit,
      costPrice,
      units,
      initialStock,
    });
    if (parsed.success) {
      input = parsed.data;
      product = {
        code: input.code,
        name: input.name.toUpperCase(),
        categoryName: category.name,
        type,
        baseUnit,
        costPrice,
        units: input.units.map(({ name, isi, sellPrice, isBase }) => ({
          name,
          isi,
          sellPrice,
          isBase,
        })),
        initialStock,
      };
    } else {
      errors.push('Data baris ini tidak valid.');
    }
  }
  return { row: { row: rowNumber, values, product, errors }, input };
}

/** Checks every row of the file against the database and against the other rows. */
function checkTable(db: Executor, table: ImportTable): CheckedRow[] {
  const indexes = columnIndexes(table.header);
  if (table.rows.length === 0) {
    throw importFileInvalid('File tidak berisi data barang. Isi mulai baris 2.');
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    throw importFileInvalid(
      `File berisi ${table.rows.length} baris. Paling banyak ${MAX_IMPORT_ROWS} baris per impor; bagi menjadi beberapa file.`,
    );
  }
  const lookups = loadLookups(db);
  const seenCodes = new Map<string, number>();
  return table.rows.map((fileRow) => {
    const values = Object.fromEntries(
      IMPORT_COLUMNS.map((c) => {
        const i = indexes.get(c);
        return [c, i === undefined ? '' : (fileRow.cells[i] ?? '')];
      }),
    ) as Record<ImportColumn, string>;
    return checkRow(values, fileRow.row, lookups, seenCodes);
  });
}

async function readRequest(request: ImportRequest): Promise<ImportTable> {
  const format = importFormatOf(request.fileName);
  const buffer = Buffer.from(request.contentBase64, 'base64');
  if (buffer.length === 0) throw importFileInvalid('File kosong.');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw importFileInvalid('Ukuran file paling besar 5 MB.');
  }
  return readImportFile(format, buffer);
}

/** Every row with its errors; nothing is saved. */
export async function previewImport(
  ctx: ServiceContext,
  request: ImportRequest,
): Promise<ImportPreviewResponse> {
  const rows = checkTable(ctx.db, await readRequest(request)).map((c) => c.row);
  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { rows, total: rows.length, valid: rows.length - invalid, invalid };
}

/**
 * Creates every product of the file in one transaction, re-checking all rows inside it. Any
 * row with an error rejects the whole file.
 */
export async function commitImport(
  ctx: ServiceContext,
  actor: Actor,
  request: ImportRequest,
): Promise<ImportCommitResponse> {
  const table = await readRequest(request);
  return ctx.db.transaction((tx) => {
    const checked = checkTable(tx, table);
    const invalid = checked.filter((c) => c.input === null).length;
    if (invalid > 0) throw importHasErrors(invalid);
    const createdAt = ctx.now().toISOString();
    for (const { input } of checked) {
      insertNewProduct(tx, actor, input as CreateProductInput, {
        stockNote: STOCK_NOTE,
        createdAt,
      });
    }
    return { imported: checked.length };
  });
}
