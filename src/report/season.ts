import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { groupBy, sumBy } from '../util/collect.js';
import { cents, formatMoney, type Cents } from '../util/money.js';
import type { DayClass } from '../domain/calendar/season.js';
import type { Column } from '../util/table.js';
import { pairsSection, renderDocument, tableSection, type ReportDocument } from './writer.js';
import { daySummaries, type QueryContext } from '../service/query.js';
import { seasonTotal, type RevenueContext } from '../service/revenue.js';

/**
 * Season to date, which is the number the owners ask for by email every Monday
 * and the one most likely to be quoted back wrongly. Two rules keep it honest.
 *
 * Days the area was shut are counted and shown, because a season with eleven
 * wind days is a different season from one with none and the visit average
 * hides that.
 *
 * And the average is per day with traffic, never per calendar day, so an early
 * opening does not read as a collapse in the daily average.
 */

export interface SeasonClassRow {
  readonly dayClass: DayClass;
  readonly days: number;
  readonly skierVisits: number;
  readonly averageVisits: number;
  readonly rides: number;
  readonly verticalFt: number;
}

export interface SeasonReport {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly calendarDays: number;
  readonly scheduledDays: number;
  readonly daysOpen: number;
  readonly daysLost: number;
  readonly skierVisits: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly revenue: Cents;
  readonly averageVisits: number;
  readonly bestDate: OperatingDate | undefined;
  readonly bestVisits: number;
  readonly byClass: readonly SeasonClassRow[];
}

export type SeasonContext = QueryContext & RevenueContext;

export function buildSeasonReport(
  from: OperatingDate,
  to: OperatingDate,
  context: SeasonContext,
): SeasonReport {
  const summaries = daySummaries(from, to, context);
  const scheduled = summaries.filter((summary) => summary.status === 'scheduled');
  const open = scheduled.filter((summary) => summary.rides > 0);
  const best = [...open].sort(
    (a, b) => b.skierVisits - a.skierVisits || a.date.localeCompare(b.date),
  )[0];

  const byClass: SeasonClassRow[] = [];
  for (const [dayClass, own] of groupBy(scheduled, (summary) => summary.dayClass)) {
    const visits = sumBy(own, (summary) => summary.skierVisits);
    byClass.push({
      dayClass,
      days: own.length,
      skierVisits: visits,
      averageVisits: own.length === 0 ? 0 : Math.round(visits / own.length),
      rides: sumBy(own, (summary) => summary.rides),
      verticalFt: sumBy(own, (summary) => summary.verticalFt),
    });
  }
  byClass.sort((a, b) => b.skierVisits - a.skierVisits || a.dayClass.localeCompare(b.dayClass));

  const visits = sumBy(summaries, (summary) => summary.skierVisits);
  return {
    from,
    to,
    calendarDays: operatingDateRange(from, to).length,
    scheduledDays: scheduled.length,
    daysOpen: open.length,
    daysLost: summaries.length - scheduled.length,
    skierVisits: visits,
    rides: sumBy(summaries, (summary) => summary.rides),
    verticalFt: sumBy(summaries, (summary) => summary.verticalFt),
    revenue: seasonTotal(context),
    averageVisits: open.length === 0 ? 0 : Math.round(visits / open.length),
    bestDate: best?.date,
    bestVisits: best?.skierVisits ?? 0,
    byClass,
  };
}

const columns: Column<SeasonClassRow>[] = [
  { header: 'class', value: (row) => row.dayClass },
  { header: 'days', align: 'right', value: (row) => String(row.days) },
  { header: 'visits', align: 'right', value: (row) => String(row.skierVisits) },
  { header: 'avg', align: 'right', value: (row) => String(row.averageVisits) },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
  { header: 'vertical', align: 'right', value: (row) => row.verticalFt.toLocaleString('en-US') },
];

function bestDayLine(report: SeasonReport): string {
  if (report.bestDate === undefined) return 'none yet';
  return `${report.bestDate} (${report.bestVisits})`;
}

export function seasonDocument(report: SeasonReport): ReportDocument {
  return {
    title: `season to date  ${report.from} to ${report.to}`,
    sections: [
      pairsSection([
        ['calendar days', String(report.calendarDays)],
        ['scheduled days', String(report.scheduledDays)],
        ['days lost', String(report.daysLost)],
        ['days with traffic', String(report.daysOpen)],
        ['skier visits', String(report.skierVisits)],
        ['average a day', String(report.averageVisits)],
        ['rides', String(report.rides)],
        ['vertical feet', report.verticalFt.toLocaleString('en-US')],
        ['revenue', formatMoney(report.revenue)],
        ['best day', bestDayLine(report)],
      ]),
      tableSection(report.byClass, columns, {
        heading: 'by day class',
        emptyNote: 'the area was never scheduled in this period',
      }),
    ],
  };
}

export function renderSeasonReport(report: SeasonReport): string[] {
  return renderDocument(seasonDocument(report));
}

export function revenuePerVisit(report: SeasonReport): Cents {
  if (report.skierVisits === 0) return cents(0);
  return cents(Math.round(report.revenue / report.skierVisits));
}
