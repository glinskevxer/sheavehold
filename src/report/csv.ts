import { writeCsvTable } from '../util/csv.js';
import { hourLabel } from '../domain/capacity/capacity.js';
import type { DailyReport } from './daily.js';

/**
 * The finance office reads these into a spreadsheet, so every number is a bare
 * number with no grouping, no currency sign and no percent sign. Money is in
 * cents for the same reason: a spreadsheet that reads 1,244.00 as text has
 * caused more trouble than one that reads 124400.
 *
 * Three tables come out of one report because a spreadsheet cannot hold a
 * report shaped like the printed sheet.
 */

const LIFT_HEADER = [
  'date',
  'lift',
  'name',
  'turned',
  'rides',
  'riders',
  'vertical_ft',
  'rise_ft',
  'share_percent',
  'peak_hour_rides',
] as const;

const HOUR_HEADER = ['date', 'hour', 'label', 'rides', 'riders', 'vertical_ft'] as const;

const SUMMARY_HEADER = [
  'date',
  'status',
  'day_class',
  'scheduled_minutes',
  'skier_visits',
  'visits',
  'rides',
  'vertical_ft',
  'scans',
  'lifts_turning',
  'utilisation_percent',
  'revenue_cents',
  'revenue_per_visit_cents',
  'open_exceptions',
] as const;

export function renderLiftCsv(report: DailyReport): string {
  return writeCsvTable(
    LIFT_HEADER,
    report.lifts.map((row) => ({
      date: report.date,
      lift: row.lift,
      name: row.name,
      turned: row.turned ? 'yes' : 'no',
      rides: String(row.rides),
      riders: String(row.riders),
      vertical_ft: String(row.verticalFt),
      rise_ft: String(row.riseFt),
      share_percent: String(row.shareOfRides),
      peak_hour_rides: String(row.busiestHourRides),
    })),
  );
}

export function renderHourCsv(report: DailyReport): string {
  return writeCsvTable(
    HOUR_HEADER,
    report.hourly.map((bucket) => ({
      date: report.date,
      hour: String(bucket.hour),
      label: hourLabel(bucket.hour),
      rides: String(bucket.rides),
      riders: String(bucket.riders),
      vertical_ft: String(bucket.verticalFt),
    })),
  );
}

export function renderSummaryCsv(reports: readonly DailyReport[]): string {
  return writeCsvTable(
    SUMMARY_HEADER,
    reports.map((report) => ({
      date: report.date,
      status: report.summary.status,
      day_class: report.summary.dayClass,
      scheduled_minutes: String(report.summary.scheduledMinutes),
      skier_visits: String(report.summary.skierVisits),
      visits: String(report.summary.visits),
      rides: String(report.summary.rides),
      vertical_ft: String(report.summary.verticalFt),
      scans: String(report.summary.scans),
      lifts_turning: String(report.summary.liftsTurning),
      utilisation_percent: String(report.utilisation.utilisationPercent),
      revenue_cents: String(report.revenue),
      revenue_per_visit_cents: String(report.revenuePerVisit),
      open_exceptions: String(report.openExceptions),
    })),
  );
}

export interface CsvBundle {
  readonly summary: string;
  readonly lifts: string;
  readonly hours: string;
}

export function renderDailyCsv(report: DailyReport): CsvBundle {
  return {
    summary: renderSummaryCsv([report]),
    lifts: renderLiftCsv(report),
    hours: renderHourCsv(report),
  };
}
