import { formatAreaTime, type OperatingDate } from '../util/clock.js';
import { formatMoney, ZERO, type Cents } from '../util/money.js';
import { areaUtilisation, type AreaUtilisation } from '../domain/capacity/utilisation.js';
import { hourlyProfile, type HourBucket } from '../domain/capacity/capacity.js';
import type { ExceptionRegister } from '../domain/exception/register.js';
import { openWorkload } from '../service/exceptions.js';
import { liftDay, type LiftDayRow } from '../service/lift-query.js';
import { daySummary, type DaySummary, type QueryContext } from '../service/query.js';
import { dayRevenue, type RevenueContext } from '../service/revenue.js';

/**
 * The daily operations report, as a value. Nothing here decides anything and
 * nothing here formats anything: it gathers what the services already know into
 * one shape, and the renderers turn that into text, csv or json.
 *
 * Keeping the model separate from the rendering is what stopped the csv and the
 * printed sheet quietly disagreeing, which they did for most of one season
 * because each one did its own rounding.
 */

export interface DailyReport {
  readonly date: OperatingDate;
  readonly generatedAt: Date;
  readonly summary: DaySummary;
  readonly lifts: readonly LiftDayRow[];
  readonly hourly: readonly HourBucket[];
  readonly utilisation: AreaUtilisation;
  readonly revenue: Cents;
  readonly revenuePerVisit: Cents;
  readonly openExceptions: number;
  readonly highExceptions: number;
  readonly headline: readonly (readonly [string, string])[];
}

export interface DailyReportContext extends QueryContext, RevenueContext {
  readonly register: ExceptionRegister;
  readonly generatedAt?: Date | undefined;
}

export function buildDailyReport(date: OperatingDate, context: DailyReportContext): DailyReport {
  const summary = daySummary(date, context);
  const rides = context.rides.ridesOn(date);
  const utilisation = areaUtilisation(date, rides, context.lifts, context.calendar.plan(date));
  const revenueRow = dayRevenue(date, date, context)[0];
  const revenue = revenueRow?.value ?? ZERO;
  const workload = openWorkload(context.register);

  const headline: (readonly [string, string])[] = [
    ['skier visits', String(summary.skierVisits)],
    ['rides', String(summary.rides)],
    ['vertical feet', summary.verticalFt.toLocaleString('en-US')],
    ['lifts turning', String(summary.liftsTurning)],
    ['utilisation', `${utilisation.utilisationPercent}%`],
    ['revenue', formatMoney(revenue)],
    ['open exceptions', String(workload.open)],
  ];

  return {
    date,
    generatedAt: context.generatedAt ?? new Date(),
    summary,
    lifts: liftDay(date, context),
    hourly: hourlyProfile(rides),
    utilisation,
    revenue,
    revenuePerVisit: revenueRow?.perVisit ?? ZERO,
    openExceptions: workload.open,
    highExceptions: workload.high,
    headline,
  };
}

/** One line the ops manager reads before anything else. */
export function oneLine(report: DailyReport): string {
  const { summary } = report;
  if (summary.status !== 'scheduled') {
    return `${report.date}: ${summary.status.replace('_', ' ')}`;
  }
  if (summary.rides === 0) {
    return `${report.date}: scheduled and nobody rode`;
  }
  return `${report.date}: ${summary.skierVisits} visits, ${summary.rides} rides, ${summary.liftsTurning} lifts`;
}

export function firstAndLast(report: DailyReport): string {
  if (report.summary.firstRideAt === undefined || report.summary.lastRideAt === undefined) {
    return 'nothing turned';
  }
  return `${formatAreaTime(report.summary.firstRideAt)} to ${formatAreaTime(report.summary.lastRideAt)}`;
}

/** Lifts that carried nobody on a day the area was open, worth explaining. */
export function unexplainedIdleLifts(report: DailyReport): LiftDayRow[] {
  if (report.summary.status !== 'scheduled') return [];
  return report.lifts.filter((row) => !row.turned);
}
