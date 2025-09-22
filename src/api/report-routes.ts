import { parseOperatingDate } from '../util/clock.js';
import { buildDailyReport, type DailyReportContext } from '../report/daily.js';
import { renderDailyCsv } from '../report/csv.js';
import { toDailyReportJson } from '../report/json.js';
import { renderDailyReport } from '../report/text.js';
import { buildSeasonReport, renderSeasonReport, type SeasonContext } from '../report/season.js';
import { buildUtilisationReport, renderUtilisationReport } from '../report/utilisation.js';
import {
  buildProductMix,
  renderProductMix,
  type ProductMixContext,
} from '../report/product-mix.js';
import { fail } from './problems.js';
import { ok, type ApiResponse, type Router } from './router.js';

/**
 * Reports over the wire. Every one takes a `format` query so the same route
 * serves the web front end, the printer and the finance spreadsheet, which
 * stopped three near identical endpoints existing.
 */

export type ReportFormat = 'json' | 'text' | 'csv';

export function parseFormat(raw: string | undefined): ReportFormat | undefined {
  if (raw === undefined || raw === '') return 'json';
  if (raw === 'json' || raw === 'text' || raw === 'csv') return raw;
  return undefined;
}

function textResponse(lines: readonly string[]): ApiResponse {
  return { status: 200, body: lines.join('\n'), headers: { 'content-type': 'text/plain' } };
}

function csvResponse(body: string): ApiResponse {
  return { status: 200, body, headers: { 'content-type': 'text/csv' } };
}

export interface ReportRouteContext {
  readonly daily: DailyReportContext;
  readonly season: SeasonContext;
  readonly mix: ProductMixContext;
  readonly seasonOpensOn: string;
}

export function addReportRoutes(router: Router, context: ReportRouteContext): Router {
  router.add({
    method: 'GET',
    path: '/reports/daily/:date',
    summary: 'the daily operations report',
    handler: ({ params, query }) => {
      const date = parseOperatingDate(params.date ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      const format = parseFormat(query.format);
      if (format === undefined) return fail('bad_format', `${query.format ?? ''} is not a format`);
      const report = buildDailyReport(date.value, context.daily);
      if (format === 'text') return textResponse(renderDailyReport(report).split('\n'));
      if (format === 'csv') return csvResponse(renderDailyCsv(report).summary);
      return ok(toDailyReportJson(report));
    },
  });

  router.add({
    method: 'GET',
    path: '/reports/season',
    summary: 'season to date',
    handler: ({ query }) => {
      const from = parseOperatingDate(query.from ?? context.seasonOpensOn);
      if (!from.ok) return fail('bad_date', from.error);
      const to = parseOperatingDate(query.to ?? '');
      if (!to.ok) return fail('bad_date', to.error);
      const format = parseFormat(query.format);
      if (format === undefined) return fail('bad_format', 'unknown format');
      const report = buildSeasonReport(from.value, to.value, context.season);
      if (format === 'text') return textResponse(renderSeasonReport(report));
      return ok({
        from: report.from,
        to: report.to,
        scheduledDays: report.scheduledDays,
        daysOpen: report.daysOpen,
        daysLost: report.daysLost,
        skierVisits: report.skierVisits,
        rides: report.rides,
        verticalFt: report.verticalFt,
        revenueCents: report.revenue,
        bestDate: report.bestDate ?? null,
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/reports/utilisation',
    summary: 'lift utilisation over a period',
    handler: ({ query }) => {
      const from = parseOperatingDate(query.from ?? '');
      if (!from.ok) return fail('bad_date', from.error);
      const to = parseOperatingDate(query.to ?? '');
      if (!to.ok) return fail('bad_date', to.error);
      const report = buildUtilisationReport(from.value, to.value, context.daily);
      if (parseFormat(query.format) === 'text')
        return textResponse(renderUtilisationReport(report));
      return ok({
        from: report.from,
        to: report.to,
        areaAverage: report.areaAverage,
        lifts: report.rows,
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/reports/products',
    summary: 'product mix over a period',
    handler: ({ query }) => {
      const from = parseOperatingDate(query.from ?? '');
      if (!from.ok) return fail('bad_date', from.error);
      const to = parseOperatingDate(query.to ?? '');
      if (!to.ok) return fail('bad_date', to.error);
      const report = buildProductMix(from.value, to.value, context.mix);
      if (parseFormat(query.format) === 'text') return textResponse(renderProductMix(report));
      return ok({
        from: report.from,
        to: report.to,
        totalVisits: report.totalVisits,
        totalValueCents: report.totalValue,
        rows: report.rows,
      });
    },
  });

  return router;
}
