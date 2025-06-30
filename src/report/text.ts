import { formatAreaTime } from '../util/clock.js';
import { formatMoney } from '../util/money.js';
import { hourLabel } from '../domain/capacity/capacity.js';
import { indent, renderHeading, renderPairs, renderTable, type Column } from '../util/table.js';
import type { LiftDayRow } from '../service/lift-query.js';
import type { HourBucket } from '../domain/capacity/capacity.js';
import { firstAndLast, oneLine, unexplainedIdleLifts, type DailyReport } from './daily.js';

/**
 * The printed sheet. Fixed width, no colour, ninety six columns, because it
 * goes on the thermal printer in the ops office and gets stuck to the wall.
 *
 * Column order here is the order the mountain manager reads in and it has been
 * argued about more than any algorithm in this codebase.
 */

const liftColumns: Column<LiftDayRow>[] = [
  { header: 'lift', value: (row) => row.lift },
  { header: 'name', maxWidth: 22, value: (row) => row.name },
  { header: 'rides', align: 'right', value: (row) => (row.turned ? String(row.rides) : '.') },
  { header: 'riders', align: 'right', value: (row) => (row.turned ? String(row.riders) : '.') },
  {
    header: 'vertical',
    align: 'right',
    value: (row) => (row.turned ? row.verticalFt.toLocaleString('en-US') : '.'),
  },
  { header: 'share', align: 'right', value: (row) => (row.turned ? `${row.shareOfRides}%` : '.') },
  {
    header: 'peak hour',
    value: (row) =>
      row.busiestHourStart === undefined ? '.' : formatAreaTime(row.busiestHourStart).slice(11, 16),
  },
];

const hourColumns: Column<HourBucket>[] = [
  { header: 'hour', value: (row) => hourLabel(row.hour) },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
  { header: 'riders', align: 'right', value: (row) => String(row.riders) },
  { header: 'vertical', align: 'right', value: (row) => row.verticalFt.toLocaleString('en-US') },
];

export function renderDailyReportText(report: DailyReport): string[] {
  const lines: string[] = [];
  lines.push(...renderHeading(`sheavehold daily operations  ${report.date}`));
  lines.push('');
  lines.push(oneLine(report));
  lines.push(`lifts ran ${firstAndLast(report)}`);
  lines.push('');
  lines.push(...renderPairs(report.headline));
  lines.push('');
  lines.push('lifts');
  lines.push(...indent(renderTable(report.lifts, liftColumns)));
  lines.push('');
  lines.push('by the hour');
  lines.push(...indent(renderTable(report.hourly, hourColumns)));

  const idle = unexplainedIdleLifts(report);
  if (idle.length > 0) {
    lines.push('');
    lines.push(`lifts that did not turn: ${idle.map((row) => row.lift).join(', ')}`);
  }

  if (report.openExceptions > 0) {
    lines.push('');
    lines.push(
      `${report.openExceptions} exceptions are open, ${report.highExceptions} of them serious`,
    );
  }

  lines.push('');
  lines.push(
    `revenue ${formatMoney(report.revenue)}, ${formatMoney(report.revenuePerVisit)} a visit`,
  );
  lines.push(`printed ${formatAreaTime(report.generatedAt)}`);
  return lines;
}

export function renderDailyReport(report: DailyReport): string {
  return renderDailyReportText(report).join('\n');
}
