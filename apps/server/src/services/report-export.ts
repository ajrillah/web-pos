import { formatInteger, formatPercentBp, formatRupiah } from '@toko-podomoro/shared';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Cell, ColumnKind, ReportDocument, Section } from './report-documents';

// Renders a ReportDocument as an A4 PDF (pdfkit) or an Excel workbook (exceljs).

const pad = (n: number) => String(n).padStart(2, '0');

/** Local `dd/mm/yyyy hh:mm` (the PC's time zone). */
export function localDateTime(iso: string | Date): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A cell as display text, as in the PDF. */
export function formatCell(value: Cell, kind: ColumnKind): string {
  if (value === null) return '';
  if (typeof value === 'string') return kind === 'datetime' ? localDateTime(value) : value;
  if (kind === 'money') return formatRupiah(value);
  if (kind === 'percent') return formatPercentBp(value);
  return formatInteger(value);
}

// --- PDF ---

const MARGIN = 36;
const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const BODY_SIZE = 8.5;
const ROW_HEIGHT = 15;

export function renderReportPdf(report: ReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: report.landscape ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: report.title, Producer: 'TOKO PODOMORO' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const width = doc.page.width - 2 * MARGIN;
  const bottom = () => doc.page.height - MARGIN - 14;
  let y = MARGIN;

  const ellipsize = (value: string, max: number) => {
    if (doc.widthOfString(value) <= max) return value;
    let cut = value;
    while (cut.length > 1 && doc.widthOfString(`${cut}...`) > max) cut = cut.slice(0, -1);
    return `${cut}...`;
  };

  doc.font(BOLD).fontSize(16).text(report.title, MARGIN, y);
  y = doc.y + 2;
  doc.font(FONT).fontSize(9).fillColor('#50605F');
  for (const line of report.meta) {
    doc.text(line, MARGIN, y);
    y = doc.y;
  }
  doc.fillColor('#0B2422');
  y += 10;

  // Summary as label / value pairs, two per line.
  const half = width / 2;
  report.summary.forEach((item, i) => {
    const x = MARGIN + (i % 2) * half;
    if (i % 2 === 0 && i > 0) y += 16;
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor('#50605F')
      .text(item.label, x, y, { width: half * 0.58 });
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor('#0B2422')
      .text(formatCell(item.value, item.kind), x + half * 0.58, y, {
        width: half * 0.38,
        align: 'right',
      });
  });
  y += report.summary.length > 0 ? 28 : 0;

  const drawSection = (section: Section) => {
    const total = section.columns.reduce((s, c) => s + c.width, 0);
    const widths = section.columns.map((c) => (c.width / total) * width);
    const right = (kind: ColumnKind) => kind !== 'text' && kind !== 'datetime';
    const drawRow = (cells: Cell[], bold: boolean) => {
      let x = MARGIN;
      doc.font(bold ? BOLD : FONT).fontSize(BODY_SIZE);
      section.columns.forEach((column, i) => {
        const w = widths[i] ?? 0;
        const value = cells[i] ?? null;
        const shown = ellipsize(formatCell(value, column.kind), w - 6);
        const negative = typeof value === 'number' && value < 0 && column.kind === 'money';
        doc.fillColor(negative ? '#B42318' : '#0B2422').text(shown, x + 3, y + 3.5, {
          width: w - 6,
          align: right(column.kind) ? 'right' : 'left',
          lineBreak: false,
        });
        x += w;
      });
      doc.fillColor('#0B2422');
      y += ROW_HEIGHT;
    };
    const drawHeader = () => {
      let x = MARGIN;
      doc.font(BOLD).fontSize(7.5).fillColor('#50605F');
      section.columns.forEach((column, i) => {
        const w = widths[i] ?? 0;
        doc.text(column.label.toUpperCase(), x + 3, y + 3, {
          width: w - 6,
          align: right(column.kind) ? 'right' : 'left',
          lineBreak: false,
        });
        x += w;
      });
      y += ROW_HEIGHT;
      doc
        .moveTo(MARGIN, y - 2)
        .lineTo(MARGIN + width, y - 2)
        .strokeColor('#D8E1E0')
        .stroke();
      doc.fillColor('#0B2422');
    };
    const newPageIfNeeded = (needed: number, withHeader: boolean) => {
      if (y + needed <= bottom()) return;
      doc.addPage();
      y = MARGIN;
      if (withHeader) drawHeader();
    };

    newPageIfNeeded(ROW_HEIGHT * 3 + 20, false);
    doc.font(BOLD).fontSize(11).text(section.title, MARGIN, y);
    y = doc.y + 4;
    drawHeader();
    if (section.rows.length === 0) {
      doc
        .font(FONT)
        .fontSize(BODY_SIZE)
        .fillColor('#50605F')
        .text('Tidak ada data.', MARGIN + 3, y + 3);
      doc.fillColor('#0B2422');
      y += ROW_HEIGHT;
    }
    for (const row of section.rows) {
      newPageIfNeeded(ROW_HEIGHT, true);
      drawRow(row, false);
    }
    if (section.footer) {
      newPageIfNeeded(ROW_HEIGHT, true);
      doc
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + width, y)
        .strokeColor('#D8E1E0')
        .stroke();
      drawRow(section.footer, true);
    }
    y += 14;
  };
  for (const section of report.sections) drawSection(section);

  // Page numbers.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor('#607070')
      .text(
        `${report.title} · halaman ${i + 1} dari ${range.count}`,
        MARGIN,
        doc.page.height - MARGIN,
        {
          width,
          align: 'right',
          lineBreak: false,
        },
      );
  }
  doc.end();
  return done;
}

// --- Excel ---

const MONEY_FORMAT = '"Rp "#,##0;-"Rp "#,##0';

/** Sheet names: at most 31 characters, without : \ / ? * [ ]. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 28);
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base} ${n}`;
  used.add(candidate);
  return candidate;
}

/** Excel shows dates without a time zone: store the local wall-clock time. */
const excelDate = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
};

function excelValue(value: Cell, kind: ColumnKind): ExcelJS.CellValue {
  if (value === null) return null;
  if (kind === 'datetime' && typeof value === 'string') return excelDate(value);
  if (kind === 'percent' && typeof value === 'number') return value / 10_000;
  return value;
}

const NUM_FORMATS: Partial<Record<ColumnKind, string>> = {
  money: MONEY_FORMAT,
  int: '#,##0',
  percent: '0.00%',
  datetime: 'dd/mm/yyyy hh:mm',
};

export async function renderReportXlsx(report: ReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TOKO PODOMORO';
  const used = new Set<string>();

  const summary = workbook.addWorksheet(sheetName('Ringkasan', used));
  summary.getColumn(1).width = 42;
  summary.getColumn(2).width = 22;
  summary.addRow([report.title]).font = { bold: true, size: 14 };
  for (const line of report.meta) summary.addRow([line]);
  summary.addRow([]);
  for (const item of report.summary) {
    const row = summary.addRow([item.label, excelValue(item.value, item.kind)]);
    const format = NUM_FORMATS[item.kind];
    if (format) row.getCell(2).numFmt = format;
  }

  for (const section of report.sections) {
    const sheet = workbook.addWorksheet(sheetName(section.title, used));
    section.columns.forEach((column, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = Math.max(10, Math.round(column.width * 8));
      const format = NUM_FORMATS[column.kind];
      if (format) col.numFmt = format;
    });
    const header = sheet.addRow(section.columns.map((c) => c.label));
    header.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const cells of section.rows) {
      sheet.addRow(section.columns.map((c, i) => excelValue(cells[i] ?? null, c.kind)));
    }
    if (section.footer) {
      const footer = sheet.addRow(
        section.columns.map((c, i) => excelValue(section.footer?.[i] ?? null, c.kind)),
      );
      footer.font = { bold: true };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
