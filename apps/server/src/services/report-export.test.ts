import { describe, expect, it } from 'vitest';
import type { ReportDocument } from './report-documents';
import { formatCell, renderReportPdf, renderReportXlsx } from './report-export';

const pages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

function document(rows: number): ReportDocument {
  return {
    title: 'Laporan Uji',
    meta: ['TOKO PODOMORO', 'Tanggal 22/10/2026'],
    summary: [{ label: 'Total', value: rows * 1000, kind: 'money' }],
    landscape: false,
    sections: [
      {
        title: 'Rincian',
        columns: [
          { label: 'Barang', kind: 'text', width: 3 },
          { label: 'Nilai', kind: 'money', width: 2 },
        ],
        rows: Array.from({ length: rows }, (_, i) => [`Barang ${i + 1}`, 1000]),
        footer: ['Total', rows * 1000],
      },
    ],
  };
}

describe('report export', () => {
  it('formats cells like the screen', () => {
    expect(formatCell(-12345, 'money')).toBe('-Rp 12.345');
    expect(formatCell(1850, 'percent')).toBe('18,5%');
    expect(formatCell(1250, 'int')).toBe('1.250');
    expect(formatCell(null, 'money')).toBe('');
  });

  it('continues long tables on new pages without blank pages', async () => {
    expect(pages(await renderReportPdf(document(5)))).toBe(1);
    const long = pages(await renderReportPdf(document(150)));
    // About 48 rows fit on an A4 portrait page.
    expect(long).toBeGreaterThanOrEqual(3);
    expect(long).toBeLessThanOrEqual(4);
  });

  it('writes a workbook', async () => {
    const xlsx = await renderReportXlsx(document(3));
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  });
});
