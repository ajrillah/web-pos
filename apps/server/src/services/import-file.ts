import { IMPORT_COLUMNS, type ImportColumn, type ImportFormat } from '@toko-podomoro/shared';
import ExcelJS from 'exceljs';
import { AppError } from '../errors';

// Reads product import files (.xlsx, UTF-8 .csv) into cell text and builds the .xlsx template.

/** A data row: its number in the file (header = 1) and its cells as text, by header position. */
export interface FileRow {
  row: number;
  cells: string[];
}

export interface ImportTable {
  header: string[];
  rows: FileRow[];
}

export const importFileInvalid = (message: string) =>
  new AppError(400, 'IMPORT_FILE_INVALID', message);

export function importFormatOf(fileName: string): ImportFormat {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'csv') return ext;
  throw importFileInvalid('Format file tidak didukung. Gunakan file .xlsx atau .csv.');
}

/** Cell value as text: numbers in plain digits (no thousands separators), formulas by result. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
  }
  if ('text' in value) return String(value.text);
  return '';
}

async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw importFileInvalid('File Excel tidak dapat dibaca. Simpan ulang sebagai .xlsx.');
  }
  const sheet =
    workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'barang') ??
    workbook.worksheets[0];
  if (!sheet) return [];
  const lines: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });
    lines[rowNumber - 1] = Array.from(cells, (c) => c ?? '');
  });
  return Array.from(lines, (l) => l ?? []);
}

/**
 * RFC 4180 CSV with quotes and CRLF. The delimiter is `;` or `,`, whichever the header uses
 * more (Excel with Indonesian regional settings saves `;`).
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      line.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      line.push(cell);
      lines.push(line);
      line = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || line.length > 0) {
    line.push(cell);
    lines.push(line);
  }
  return lines;
}

function readCsv(buffer: Buffer): string[][] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw importFileInvalid('File CSV harus disimpan dengan encoding UTF-8.');
  }
  return parseCsv(text);
}

/** Header (row 1) and the non-empty rows below it. */
export async function readImportFile(format: ImportFormat, buffer: Buffer): Promise<ImportTable> {
  const lines = format === 'xlsx' ? await readXlsx(buffer) : readCsv(buffer);
  const [header = [], ...rest] = lines;
  const rows = rest
    .map((cells, i) => ({ row: i + 2, cells: cells.map((c) => c.trim()) }))
    .filter((r) => r.cells.some((c) => c !== ''));
  return { header: header.map((h) => h.trim().toLowerCase()), rows };
}

// --- Template ---

interface ColumnNote {
  required: string;
  note: string;
  width: number;
}

const COLUMN_NOTES: Record<ImportColumn, ColumnNote> = {
  kode: {
    required: 'Wajib',
    note: 'Kode unik: huruf, angka, dan . _ / - tanpa spasi (maks 32). Kode yang sudah ada (termasuk barang nonaktif) ditolak.',
    width: 16,
  },
  nama: { required: 'Wajib', note: 'Nama barang (maks 100 karakter).', width: 28 },
  kategori: {
    required: 'Wajib',
    note: 'Nama kategori yang sudah ada di aplikasi (huruf besar/kecil diabaikan).',
    width: 14,
  },
  jenis: {
    required: 'Wajib',
    note: '"satuan" untuk barang biasa, "curah" untuk barang timbang (gram/ml).',
    width: 10,
  },
  satuan_stok: {
    required: 'Wajib',
    note: 'Satuan stok. Barang satuan: mis. pcs, bks, btl. Barang curah: gram atau ml.',
    width: 12,
  },
  harga_pokok: {
    required: 'Wajib',
    note: 'Harga modal (Rupiah, bilangan bulat). Barang satuan: per satuan stok. Barang curah: per kg / liter.',
    width: 13,
  },
  satuan_jual: {
    required: 'Wajib (satuan)',
    note: 'Satuan jual utama, isi 1 satuan stok. Barang curah: boleh kosong (otomatis kg / liter).',
    width: 12,
  },
  harga_jual: {
    required: 'Wajib',
    note: 'Harga jual satuan utama (Rupiah). Barang curah: per kg / liter.',
    width: 12,
  },
  satuan2_nama: {
    required: 'Opsional',
    note: 'Satuan jual tambahan, mis. dus. Isi nama, isi, dan harga sekaligus. Tidak untuk barang curah.',
    width: 13,
  },
  satuan2_isi: {
    required: 'Opsional',
    note: 'Jumlah satuan stok dalam satuan tambahan, mis. 40.',
    width: 11,
  },
  satuan2_harga: { required: 'Opsional', note: 'Harga jual satuan tambahan (Rupiah).', width: 13 },
  satuan3_nama: { required: 'Opsional', note: 'Seperti satuan2_nama.', width: 13 },
  satuan3_isi: { required: 'Opsional', note: 'Seperti satuan2_isi.', width: 11 },
  satuan3_harga: { required: 'Opsional', note: 'Seperti satuan2_harga.', width: 13 },
  stok_awal: {
    required: 'Opsional',
    note: 'Stok awal dalam satuan stok (barang curah: gram / ml). Dicatat sebagai penyesuaian "Stok awal (impor)".',
    width: 11,
  },
};

const EXAMPLES: (string | number)[][] = [
  ['IDM-GRG', 'Indomie Goreng', 'Sembako', 'satuan', 'pcs', 2900, 'pcs', 3500, 'dus', 40, 130000],
  [
    'GG-SURYA12',
    'Gudang Garam Surya 12',
    'Rokok',
    'satuan',
    'bks',
    24000,
    'bks',
    26000,
    'slop',
    10,
    255000,
    '',
    '',
    '',
    20,
  ],
  [
    'GULA',
    'Gula Pasir',
    'Sembako',
    'curah',
    'gram',
    15000,
    'kg',
    17500,
    '',
    '',
    '',
    '',
    '',
    '',
    25000,
  ],
];

/** Template: sheet "Barang" (header with notes, ready to fill) and "Petunjuk" (notes, examples). */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TOKO PODOMORO';

  const sheet = workbook.addWorksheet('Barang', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = IMPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: COLUMN_NOTES[key].width,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  IMPORT_COLUMNS.forEach((key, i) => {
    header.getCell(i + 1).note = `${COLUMN_NOTES[key].required}. ${COLUMN_NOTES[key].note}`;
  });

  const help = workbook.addWorksheet('Petunjuk');
  help.columns = [{ width: 16 }, { width: 16 }, { width: 90 }];
  help.addRow(['Impor barang TOKO PODOMORO']).font = { bold: true, size: 14 };
  help.addRow([
    'Isi sheet "Barang" mulai baris 2, satu barang per baris. Hanya barang baru yang diimpor; jika ada satu baris bermasalah, tidak ada barang yang disimpan.',
  ]);
  help.addRow([]);
  help.addRow(['Kolom', 'Wajib', 'Keterangan']).font = { bold: true };
  for (const key of IMPORT_COLUMNS) {
    help.addRow([key, COLUMN_NOTES[key].required, COLUMN_NOTES[key].note]);
  }
  help.addRow([]);
  help.addRow(['Contoh baris (salin ke sheet "Barang" bila perlu)']).font = { bold: true };
  help.addRow([...IMPORT_COLUMNS]).font = { bold: true };
  for (const example of EXAMPLES) help.addRow(example);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
