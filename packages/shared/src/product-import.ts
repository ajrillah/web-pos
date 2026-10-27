import { z } from 'zod';
import { productTypeSchema } from './catalog';

// Product import from .xlsx / .csv. Rules: docs/design.md 6.5 "Import".

/** Template columns, in order. */
export const IMPORT_COLUMNS = [
  'kode',
  'nama',
  'kategori',
  'jenis',
  'satuan_stok',
  'harga_pokok',
  'satuan_jual',
  'harga_jual',
  'satuan2_nama',
  'satuan2_isi',
  'satuan2_harga',
  'satuan3_nama',
  'satuan3_isi',
  'satuan3_harga',
  'stok_awal',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns a file may leave out entirely. */
export const OPTIONAL_IMPORT_COLUMNS: readonly ImportColumn[] = [
  'satuan2_nama',
  'satuan2_isi',
  'satuan2_harga',
  'satuan3_nama',
  'satuan3_isi',
  'satuan3_harga',
  'stok_awal',
];

/** `jenis` values in the file, by product type. */
export const IMPORT_TYPE_VALUES = { satuan: 'unit', curah: 'bulk' } as const;

export const MAX_IMPORT_ROWS = 2000;
/** Uploaded file size limit (bytes, before base64). */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export const importFormatSchema = z.enum(['xlsx', 'csv']);
export type ImportFormat = z.infer<typeof importFormatSchema>;

/** The uploaded file, base64-encoded. Preview and commit take the same body. */
export const importRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_IMPORT_FILE_BYTES * 4) / 3) + 4),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

/** A row that passed validation, as it will be created. */
export const importedProductSchema = z.object({
  code: z.string(),
  name: z.string(),
  categoryName: z.string(),
  type: productTypeSchema,
  baseUnit: z.string(),
  costPrice: z.number().int(),
  units: z.array(
    z.object({
      name: z.string(),
      /** Base units in one of this unit; import creates flat rows (docs/design.md 4.1.1). */
      isi: z.number().int(),
      sellPrice: z.number().int(),
      isBase: z.boolean(),
    }),
  ),
  initialStock: z.number().int(),
});
export type ImportedProduct = z.infer<typeof importedProductSchema>;

export const importRowSchema = z.object({
  /** Row number in the file (the header is row 1). */
  row: z.number().int(),
  /** Cell text as read from the file, by column. */
  values: z.record(z.string(), z.string()),
  /** Set when the row has no errors. */
  product: importedProductSchema.nullable(),
  /** Indonesian messages; empty when the row is valid. */
  errors: z.array(z.string()),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importPreviewResponseSchema = z.object({
  rows: z.array(importRowSchema),
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

export const importCommitResponseSchema = z.object({ imported: z.number().int() });
export type ImportCommitResponse = z.infer<typeof importCommitResponseSchema>;
