import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { distinctSorted, groupBy, sumBy, tallyBy } from '../util/collect.js';
import type { LiftCode } from '../util/ids.js';
import type { OperatingCalendar, DayClass, DayStatus } from '../domain/calendar/season.js';
import { scheduledMinutes } from '../domain/calendar/season.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import type { RideStore } from '../storage/repository/rides.js';
import type { ScanStore } from '../storage/repository/scans.js';

/**
 * The read side. Nothing here computes a rule, it only adds up what the
 * recompute already decided, which is what keeps a report and the store from
 * disagreeing about the same day.
 */

export interface DaySummary {
  readonly date: OperatingDate;
  readonly status: DayStatus;
  readonly dayClass: DayClass;
  readonly scheduledMinutes: number;
  readonly skierVisits: number;
  readonly visits: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly scans: number;
  readonly liftsTurning: number;
  readonly firstRideAt: Date | undefined;
  readonly lastRideAt: Date | undefined;
  readonly ridesPerVisit: number;
  readonly verticalPerVisit: number;
  readonly productMix: ReadonlyMap<string, number>;
}

export interface QueryContext {
  readonly rides: RideStore;
  readonly scans: ScanStore;
  readonly calendar: OperatingCalendar;
  readonly lifts: LiftRegistry;
}

export function daySummary(date: OperatingDate, context: QueryContext): DaySummary {
  const plan = context.calendar.plan(date);
  const rides = context.rides.ridesOn(date);
  const visits = context.rides.visitsOn(date);
  const skierVisits = context.rides.skierVisitsOn(date);
  const vertical = sumBy(rides, (ride) => ride.verticalFt);

  return {
    date,
    status: plan.status,
    dayClass: plan.dayClass,
    scheduledMinutes: scheduledMinutes(plan),
    skierVisits,
    visits: visits.length,
    rides: rides.length,
    verticalFt: vertical,
    scans: context.scans.countOnDate(date),
    liftsTurning: distinctSorted(rides, (ride) => ride.lift).length,
    firstRideAt: rides[0]?.boardedAt,
    lastRideAt: rides.at(-1)?.boardedAt,
    ridesPerVisit: visits.length === 0 ? 0 : Math.round((rides.length / visits.length) * 10) / 10,
    verticalPerVisit: skierVisits === 0 ? 0 : Math.round(vertical / skierVisits),
    productMix: tallyBy(visits, (visit) => visit.productCode),
  };
}

export function daySummaries(
  from: OperatingDate,
  to: OperatingDate,
  context: QueryContext,
): DaySummary[] {
  return operatingDateRange(from, to).map((date) => daySummary(date, context));
}

/** Days in a period that produced anything at all. */
export function activeDates(
  from: OperatingDate,
  to: OperatingDate,
  context: QueryContext,
): OperatingDate[] {
  return operatingDateRange(from, to).filter((date) => context.rides.ridesOn(date).length > 0);
}

export interface PeriodTotals {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly operatingDays: number;
  readonly daysWithTraffic: number;
  readonly skierVisits: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly busiestDate: OperatingDate | undefined;
  readonly quietestDate: OperatingDate | undefined;
}

export function periodTotals(
  from: OperatingDate,
  to: OperatingDate,
  context: QueryContext,
): PeriodTotals {
  const summaries = daySummaries(from, to, context);
  const withTraffic = summaries.filter((summary) => summary.rides > 0);
  const byVisits = [...withTraffic].sort(
    (a, b) => b.skierVisits - a.skierVisits || a.date.localeCompare(b.date),
  );
  return {
    from,
    to,
    operatingDays: summaries.filter((summary) => summary.status === 'scheduled').length,
    daysWithTraffic: withTraffic.length,
    skierVisits: sumBy(summaries, (summary) => summary.skierVisits),
    rides: sumBy(summaries, (summary) => summary.rides),
    verticalFt: sumBy(summaries, (summary) => summary.verticalFt),
    busiestDate: byVisits[0]?.date,
    quietestDate: byVisits[byVisits.length - 1]?.date,
  };
}

/** Rides per lift on a day, for the lift column of the ops sheet. */
export function ridesByLiftOn(date: OperatingDate, context: QueryContext): Map<LiftCode, number> {
  const counts = new Map<LiftCode, number>();
  for (const [lift, own] of groupBy(context.rides.ridesOn(date), (ride) => ride.lift)) {
    counts.set(lift, own.length);
  }
  return counts;
}
