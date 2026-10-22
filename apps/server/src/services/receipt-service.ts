import fs from 'node:fs';
import path from 'node:path';
import {
  formatInteger,
  formatRupiah,
  formatUnitQty,
  type ReceiptSavedResponse,
  type Sale,
  type Settings,
} from '@toko-podomoro/shared';
import PDFDocument from 'pdfkit';
import { appErrors } from '../errors';
import { findSaleById, updateSale } from '../repositories/sales-repository';
import type { ServiceContext } from './context';
import { getSale } from './sale-service';
import { getSettings } from './settings-service';

// Receipt rules: docs/design.md 6.2. Monospace text, so columns line up on thermal paper.

/** Characters per line by paper width. */
const LINE_CHARS = { '58': 32, '80': 42 } as const;
const MM_TO_PT = 72 / 25.4;
const MARGIN_PT = 8;
/** Courier glyphs are 0.6 em wide. */
const COURIER_EM_WIDTH = 0.6;

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Words longer than a line are cut.
    let rest = word;
    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
}

const center = (text: string, width: number) =>
  wrap(text, width).map((line) =>
    line.padStart(Math.floor((width + line.length) / 2)).padEnd(width),
  );

/** `left` and `right` on one line, right-aligned; `right` moves to its own line if needed. */
function columns(left: string, right: string, width: number): string[] {
  if (left.length + 1 + right.length <= width) {
    return [left + right.padStart(width - left.length)];
  }
  return [...wrap(left, width), right.padStart(width)];
}

/** Two-digit local date and time, e.g. `22/10/2026 14:05`. */
function localDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface ReceiptOptions {
  /** Every receipt after the first is a copy ("SALINAN"). */
  copy: boolean;
}

/** The receipt as fixed-width text lines. Pure, so it is tested directly. */
export function receiptLines(sale: Sale, settings: Settings, { copy }: ReceiptOptions): string[] {
  const w = LINE_CHARS[settings.receiptWidth];
  const rule = '-'.repeat(w);
  const lines: string[] = [];
  lines.push(...center(settings.storeName, w));
  if (settings.storeAddress) lines.push(...center(settings.storeAddress, w));
  if (settings.storePhone) lines.push(...center(settings.storePhone, w));
  if (copy) lines.push(...center('*** SALINAN ***', w));
  if (sale.status === 'voided') lines.push(...center('*** DIBATALKAN ***', w));
  lines.push(rule);
  lines.push(...columns('No', sale.number ?? '-', w));
  lines.push(...columns('Tanggal', localDateTime(sale.completedAt ?? sale.createdAt), w));
  lines.push(...columns('Kasir', sale.cashierName, w));
  lines.push(rule);
  for (const item of sale.items) {
    lines.push(...wrap(item.productName, w));
    const qty = `${formatUnitQty(item.qtyBase, item.unitFactor)} ${item.unitName}`;
    lines.push(
      ...columns(`  ${qty} x ${formatInteger(item.unitPrice)}`, formatInteger(item.subtotal), w),
    );
  }
  lines.push(rule);
  lines.push(...columns('Subtotal', formatInteger(sale.subtotal), w));
  if (sale.roundingAmount !== 0) {
    lines.push(...columns('Pembulatan', formatInteger(sale.roundingAmount), w));
  }
  lines.push(...columns('TOTAL', formatRupiah(sale.total), w));
  for (const payment of sale.payments) {
    lines.push(
      ...columns(payment.method === 'cash' ? 'Tunai' : 'QRIS', formatInteger(payment.amount), w),
    );
  }
  lines.push(...columns('Kembali', formatInteger(sale.changeAmount), w));
  lines.push(rule);
  if (settings.receiptFooter) lines.push(...center(settings.receiptFooter, w));
  return lines.map((line) => line.trimEnd());
}

/** Renders text lines into a one-page PDF exactly as tall as the receipt. */
export function renderReceiptPdf(lines: string[], widthMm: 58 | 80): Promise<Buffer> {
  const pageWidth = widthMm * MM_TO_PT;
  const chars = widthMm === 58 ? LINE_CHARS['58'] : LINE_CHARS['80'];
  const fontSize = (pageWidth - 2 * MARGIN_PT) / (chars * COURIER_EM_WIDTH);
  const lineHeight = fontSize * 1.25;
  const pageHeight = 2 * MARGIN_PT + Math.max(1, lines.length) * lineHeight;
  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margin: MARGIN_PT,
    info: { Title: 'Nota TOKO PODOMORO', Producer: 'TOKO PODOMORO' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font('Courier').fontSize(fontSize);
  lines.forEach((line, i) => {
    doc.text(line, MARGIN_PT, MARGIN_PT + i * lineHeight, { lineBreak: false });
  });
  doc.end();
  return done;
}

function printableSale(ctx: ServiceContext, saleId: string): Sale {
  const sale = getSale(ctx, saleId);
  if (sale.status === 'held' || !sale.number) {
    throw appErrors.saleNotFound();
  }
  return sale;
}

/** Builds the next receipt for a sale and counts it (the first is the original). */
async function nextReceipt(ctx: ServiceContext, saleId: string) {
  const sale = printableSale(ctx, saleId);
  const settings = getSettings(ctx.db);
  const copy = sale.receiptCount > 0;
  const pdf = await renderReceiptPdf(
    receiptLines(sale, settings, { copy }),
    settings.receiptWidth === '80' ? 80 : 58,
  );
  return { sale, settings, copy, pdf };
}

/** Saves the receipt PDF to the receipt folder: `<TRX>.pdf`, copies `<TRX>-SALINAN.pdf`. */
export async function saveReceipt(
  ctx: ServiceContext,
  saleId: string,
): Promise<ReceiptSavedResponse> {
  const { sale, settings, copy, pdf } = await nextReceipt(ctx, saleId);
  const folder = settings.receiptFolder;
  const fileName = `${sale.number}${copy ? '-SALINAN' : ''}.pdf`;
  const file = path.join(folder, fileName);
  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, pdf);
  } catch {
    throw appErrors.receiptSaveFailed(folder);
  }
  updateSale(ctx.db, sale.id, { receiptCount: sale.receiptCount + 1, receiptFile: file });
  return { fileName, folder, copy };
}

/** Receipt PDF for a browser download; counted like a saved one. */
export async function downloadReceipt(
  ctx: ServiceContext,
  saleId: string,
): Promise<{ fileName: string; pdf: Buffer }> {
  const { sale, copy, pdf } = await nextReceipt(ctx, saleId);
  updateSale(ctx.db, sale.id, { receiptCount: sale.receiptCount + 1 });
  return { fileName: `${sale.number}${copy ? '-SALINAN' : ''}.pdf`, pdf };
}

/** "Buka": opens the last saved receipt in the default PDF viewer. */
export function openReceipt(ctx: ServiceContext, saleId: string): void {
  const row = findSaleById(ctx.db, saleId);
  if (!row || row.status === 'held') {
    throw appErrors.saleNotFound();
  }
  if (!row.receiptFile || !fs.existsSync(row.receiptFile)) {
    throw appErrors.receiptNotSaved();
  }
  ctx.openPath(row.receiptFile);
}

/** "Buka folder": opens the receipt folder, creating it first if needed. */
export function openReceiptFolder(ctx: ServiceContext): void {
  const folder = getSettings(ctx.db).receiptFolder;
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch {
    throw appErrors.receiptSaveFailed(folder);
  }
  ctx.openPath(folder);
}
