import fs from 'node:fs';
import path from 'node:path';
import {
  type CustomerPayment,
  formatInteger,
  formatRupiah,
  formatUnitQty,
  type ReceiptSavedResponse,
  type Sale,
  type Settings,
} from '@toko-podomoro/shared';
import PDFDocument from 'pdfkit';
import { appErrors } from '../errors';
import { findPaymentById, updatePayment } from '../repositories/customer-payments-repository';
import { findSaleById, updateSale } from '../repositories/sales-repository';
import type { ServiceContext } from './context';
import { loadPayment } from './payment-service';
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
  /** Held-sale draft: prints "DRAFT" and is not recorded. */
  draft?: boolean;
}

/** The receipt as fixed-width text lines. Pure, so it is tested directly. */
export function receiptLines(sale: Sale, settings: Settings, { draft }: ReceiptOptions): string[] {
  const w = LINE_CHARS[settings.receiptWidth];
  const rule = '-'.repeat(w);
  const lines: string[] = [];
  lines.push(...center(settings.storeName, w));
  if (settings.storeAddress) lines.push(...center(settings.storeAddress, w));
  if (settings.storePhone) lines.push(...center(settings.storePhone, w));
  if (sale.status === 'voided') lines.push(...center('*** DIBATALKAN ***', w));
  if (draft) lines.push(...center('*** DRAFT ***', w));
  lines.push(rule);
  lines.push(...columns('No', sale.number ?? '-', w));
  lines.push(...columns('Tanggal', localDateTime(sale.completedAt ?? sale.createdAt), w));
  lines.push(...columns('Kasir', sale.cashierName, w));
  if (sale.customerName) lines.push(...columns('Pelanggan', sale.customerName, w));
  lines.push(rule);
  for (const item of sale.items) {
    const displayName = item.note ? `${item.productName} (${item.note})` : item.productName;
    lines.push(...wrap(displayName, w));
    const qty = `${formatUnitQty(item.qtyBase, item.unitFactor)} ${item.unitName}`;
    lines.push(
      ...columns(`  ${qty} x ${formatInteger(item.unitPrice)}`, formatInteger(item.subtotal), w),
    );
  }
  lines.push(rule);
  lines.push(`Total Item: ${sale.itemCount}`);
  lines.push(...columns('Subtotal', formatInteger(sale.subtotal), w));
  if (sale.roundingAmount !== 0) {
    lines.push(...columns('Pembulatan', formatInteger(sale.roundingAmount), w));
  }
  lines.push(...columns('TOTAL', formatRupiah(sale.total), w));
  for (const payment of sale.payments) {
    const methodLabel =
      payment.method === 'cash' ? 'Tunai' : payment.method === 'qris' ? 'QRIS' : 'Transfer';
    lines.push(...columns(methodLabel, formatInteger(payment.amount), w));
  }
  if (sale.debtAmount > 0) {
    lines.push(...columns('Kasbon', formatInteger(sale.debtAmount), w));
    const before = (sale.customerBalanceAfter ?? sale.debtAmount) - sale.debtAmount;
    lines.push(...columns('Kasbon Sebelumnya', formatRupiah(before), w));
    lines.push(...columns('Kasbon Transaksi Ini', formatRupiah(sale.debtAmount), w));
    lines.push(
      ...columns('Total Kasbon', formatRupiah(sale.customerBalanceAfter ?? sale.debtAmount), w),
    );
  } else {
    lines.push(...columns('Kembali', formatInteger(sale.changeAmount), w));
  }
  lines.push(rule);
  if (settings.receiptFooter) lines.push(...center(settings.receiptFooter, w));
  return lines.map((line) => line.trimEnd());
}

/** Payment receipt ("bukti bayar kasbon") as fixed-width text lines. */
export function paymentReceiptLines(payment: CustomerPayment, settings: Settings): string[] {
  const w = LINE_CHARS[settings.receiptWidth];
  const rule = '-'.repeat(w);
  const lines: string[] = [];
  lines.push(...center(settings.storeName, w));
  if (settings.storeAddress) lines.push(...center(settings.storeAddress, w));
  if (settings.storePhone) lines.push(...center(settings.storePhone, w));
  lines.push(...center('BUKTI BAYAR KASBON', w));
  if (payment.status === 'voided') lines.push(...center('*** DIBATALKAN ***', w));
  lines.push(rule);
  lines.push(...columns('No', payment.number, w));
  lines.push(...columns('Tanggal', localDateTime(payment.createdAt), w));
  lines.push(...columns('Kasir', payment.userName, w));
  lines.push(...columns('Pelanggan', payment.customerName, w));
  lines.push(rule);
  for (const a of payment.allocations) {
    lines.push(...columns(a.saleNumber, formatInteger(a.amount), w));
    lines.push(...columns('  sisa', formatInteger(a.remainingAfter), w));
  }
  lines.push(rule);
  lines.push(...columns('DIBAYAR', formatRupiah(payment.amount), w));
  if (payment.method === 'cash') {
    lines.push(...columns('Tunai', formatInteger(payment.amountReceived), w));
    lines.push(...columns('Kembali', formatInteger(payment.changeAmount), w));
  } else {
    lines.push(...columns('QRIS', formatInteger(payment.amountReceived), w));
  }
  lines.push(rule);
  lines.push(...columns('Sisa kasbon', formatRupiah(payment.balanceAfter), w));
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

/** A printable document: a completed/voided sale or a customer payment. */
interface ReceiptDoc {
  number: string;
  receiptCount: number;
  receiptFile: string | null;
  customerName: string | null;
  createdAt: string;
  lines: (settings: Settings) => string[];
  record: (patch: { receiptCount: number; receiptFile?: string }) => void;
}

export type ReceiptKind = 'sale' | 'payment';

function receiptDoc(ctx: ServiceContext, kind: ReceiptKind, id: string): ReceiptDoc {
  if (kind === 'payment') {
    const payment = loadPayment(ctx.db, id);
    const row = findPaymentById(ctx.db, id);
    return {
      number: payment.number,
      receiptCount: payment.receiptCount,
      receiptFile: row?.receiptFile ?? null,
      customerName: payment.customerName,
      createdAt: payment.createdAt,
      lines: (settings) => paymentReceiptLines(payment, settings),
      record: (patch) => updatePayment(ctx.db, id, patch),
    };
  }
  const row = findSaleById(ctx.db, id);
  if (!row || row.status === 'held' || !row.number) {
    throw appErrors.saleNotFound();
  }
  const sale = getSale(ctx, id);
  return {
    number: row.number,
    receiptCount: row.receiptCount,
    receiptFile: row.receiptFile,
    customerName: sale.customerName,
    createdAt: sale.completedAt ?? sale.createdAt,
    lines: (settings) => receiptLines(sale, settings, {}),
    record: (patch) => updateSale(ctx.db, id, patch),
  };
}

function receiptFileDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function sanitizeReceiptName(value: string | null): string {
  const cleaned = (value ?? '').replace(/[^A-Za-z0-9]/g, '');
  return cleaned || 'UMUM';
}

/** Builds the next receipt and its file name (JENIS-DDMMYY-NomorNota-NamaCustomer). */
async function nextReceipt(ctx: ServiceContext, kind: ReceiptKind, id: string) {
  const doc = receiptDoc(ctx, kind, id);
  const settings = getSettings(ctx.db);
  const pdf = await renderReceiptPdf(doc.lines(settings), settings.receiptWidth === '80' ? 80 : 58);
  // The type keeps a sale and a kasbon payment of the same day and number apart.
  const parts = doc.number.split('-');
  const typePart = parts[0] ?? '';
  const numberPart = parts.at(-1) ?? doc.number;
  const fileName = `${typePart}-${receiptFileDate(doc.createdAt)}-${numberPart}-${sanitizeReceiptName(doc.customerName)}.pdf`;
  return { doc, settings, pdf, fileName };
}

/**
 * Saves the receipt PDF to the receipt folder. Reprinting writes the same name again: MS3 keeps
 * no copy marking, so a reprint is the same document.
 */
export async function saveReceipt(
  ctx: ServiceContext,
  kind: ReceiptKind,
  id: string,
): Promise<ReceiptSavedResponse> {
  const { doc, settings, pdf, fileName } = await nextReceipt(ctx, kind, id);
  const folder = settings.receiptFolder;
  const file = path.join(folder, fileName);
  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, pdf);
  } catch {
    throw appErrors.receiptSaveFailed(folder);
  }
  doc.record({ receiptCount: doc.receiptCount + 1, receiptFile: file });
  return { fileName, folder };
}

/** Receipt PDF for a browser download; counted like a saved one. */
export async function downloadReceipt(
  ctx: ServiceContext,
  kind: ReceiptKind,
  id: string,
): Promise<{ fileName: string; pdf: Buffer }> {
  const { doc, pdf, fileName } = await nextReceipt(ctx, kind, id);
  doc.record({ receiptCount: doc.receiptCount + 1 });
  return { fileName, pdf };
}

/** "Buka": opens the last saved receipt in the default PDF viewer. */
export function openReceipt(ctx: ServiceContext, kind: ReceiptKind, id: string): void {
  const doc = receiptDoc(ctx, kind, id);
  if (!doc.receiptFile || !fs.existsSync(doc.receiptFile)) {
    throw appErrors.receiptNotSaved();
  }
  ctx.openPath(doc.receiptFile);
}

/** Downloads a held sale as a DRAFT receipt PDF (not recorded, no stock/omzet effect). */
export async function downloadHeldDraft(
  ctx: ServiceContext,
  id: string,
): Promise<{ fileName: string; pdf: Buffer }> {
  const sale = getSale(ctx, id);
  if (sale.status !== 'held') {
    throw appErrors.saleNotFound();
  }
  const settings = getSettings(ctx.db);
  const pdf = await renderReceiptPdf(
    receiptLines(sale, settings, { draft: true }),
    settings.receiptWidth === '80' ? 80 : 58,
  );
  return { fileName: `DRAFT-${sale.id.slice(0, 8)}.pdf`, pdf };
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
