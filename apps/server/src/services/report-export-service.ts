import {
  type ActivityReport,
  type ExportFormat,
  localDate,
  type ReportType,
} from '@toko-podomoro/shared';
import { findCategoryById } from '../repositories/categories-repository';
import type { ServiceContext } from './context';
import { reportDocument } from './report-documents';
import { localDateTime, renderReportPdf, renderReportXlsx } from './report-export';
import { activityReport, reportBuilders } from './report-service';
import { getSettings } from './settings-service';

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Every activity row of the period (the screen pages them). */
function fullActivity(ctx: ServiceContext, query: Record<string, unknown>): ActivityReport {
  const first = activityReport(ctx, { ...query, page: 1, limit: 500 });
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page++) {
    const next = activityReport(ctx, { ...query, page, limit: 500 });
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
  }
  return { ...first, rows, limit: rows.length };
}

/** A report as a PDF or Excel file, with the same query as the screen. */
export async function exportReport(
  ctx: ServiceContext,
  type: ReportType,
  format: ExportFormat,
  query: Record<string, unknown>,
): Promise<{ fileName: string; contentType: string; body: Buffer }> {
  const { page: _page, limit: _limit, ...filters } = query;
  const report =
    type === 'activity'
      ? fullActivity(ctx, filters)
      : (reportBuilders[type] as (c: ServiceContext, q: unknown) => unknown)(ctx, filters);
  const categoryId = typeof query.categoryId === 'string' ? query.categoryId : undefined;
  const document = reportDocument(type, report, {
    storeName: getSettings(ctx.db).storeName,
    printedAt: localDateTime(ctx.now()),
    categoryName: categoryId ? (findCategoryById(ctx.db, categoryId)?.name ?? null) : null,
  });
  const period = report as { from?: string; to?: string };
  const stamp = period.from
    ? period.from === period.to
      ? period.from
      : `${period.from}_${period.to}`
    : localDate(ctx.now());
  return {
    fileName: `Laporan-${type}-${stamp}.${format}`,
    contentType: CONTENT_TYPES[format],
    body: format === 'pdf' ? await renderReportPdf(document) : await renderReportXlsx(document),
  };
}
