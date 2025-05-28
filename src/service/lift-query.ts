import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { distinctSorted, groupBy, sumBy } from '../util/collect.js';
import type { LiftCode } from '../util/ids.js';
import { verticalRiseFt, type Lift } from '../domain/lift/lift.js';
import type { Ride } from '../domain/ride/ride.js';
import type { QueryContext } from './query.js';

/**
 * The lift by lift view. The mountain manager reads this one every morning and
 * the only column anybody argues about is the last one: a lift that carried
 * nobody is not the same as a lift that never ran, and the sheet has to say
 * which it was.
 */

export interface LiftDayRow {
  readonly lift: LiftCode;
  readonly name: string;
  readonly turned: boolean;
  readonly rides: number;
  readonly riders: number;
  readonly verticalFt: number;
  readonly riseFt: number;
  readonly firstRideAt: Date | undefined;
  readonly lastRideAt: Date | undefined;
  readonly busiestHourStart: Date | undefined;
  readonly busiestHourRides: number;
  readonly shareOfRides: number;
}

function busiestHour(rides: readonly Ride[]): { start: Date | undefined; count: number } {
  if (rides.length === 0) return { start: undefined, count: 0 };
  const buckets = groupBy(rides, (ride) => {
    const at = ride.boardedAt;
    return new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()),
    ).toISOString();
  });
  let bestKey: string | undefined;
  let bestCount = 0;
  for (const [key, own] of buckets) {
    if (
      own.length > bestCount ||
      (own.length === bestCount && bestKey !== undefined && key < bestKey)
    ) {
      bestKey = key;
      bestCount = own.length;
    }
  }
  return { start: bestKey === undefined ? undefined : new Date(bestKey), count: bestCount };
}

export function liftDayRow(lift: Lift, rides: readonly Ride[], dayTotal: number): LiftDayRow {
  const own = rides.filter((ride) => ride.lift === lift.code);
  const hour = busiestHour(own);
  return {
    lift: lift.code,
    name: lift.name,
    turned: own.length > 0,
    rides: own.length,
    riders: distinctSorted(own, (ride) => ride.guestId).length,
    verticalFt: sumBy(own, (ride) => ride.verticalFt),
    riseFt: verticalRiseFt(lift),
    firstRideAt: own[0]?.boardedAt,
    lastRideAt: own[own.length - 1]?.boardedAt,
    busiestHourStart: hour.start,
    busiestHourRides: hour.count,
    shareOfRides: dayTotal === 0 ? 0 : Math.round((own.length / dayTotal) * 1000) / 10,
  };
}

/** One row per lift that could have run, busiest first. */
export function liftDay(date: OperatingDate, context: QueryContext): LiftDayRow[] {
  const rides = context.rides.ridesOn(date);
  const rows = context.lifts
    .all()
    .filter((lift) => lift.status !== 'retired')
    .map((lift) => liftDayRow(lift, rides, rides.length));
  return rows.sort((a, b) => b.rides - a.rides || a.lift.localeCompare(b.lift));
}

export function liftsThatDidNotTurn(date: OperatingDate, context: QueryContext): LiftDayRow[] {
  return liftDay(date, context).filter((row) => !row.turned);
}

export interface LiftPeriodRow {
  readonly lift: LiftCode;
  readonly name: string;
  readonly daysTurning: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly bestDate: OperatingDate | undefined;
  readonly bestDateRides: number;
}

export function liftPeriod(
  from: OperatingDate,
  to: OperatingDate,
  context: QueryContext,
): LiftPeriodRow[] {
  const dates = operatingDateRange(from, to);
  const rows: LiftPeriodRow[] = [];
  for (const lift of context.lifts.all().filter((entry) => entry.status !== 'retired')) {
    let rides = 0;
    let vertical = 0;
    let daysTurning = 0;
    let bestDate: OperatingDate | undefined;
    let bestDateRides = 0;
    for (const date of dates) {
      const own = context.rides.ridesOnLift(lift.code, date);
      if (own.length === 0) continue;
      daysTurning += 1;
      rides += own.length;
      vertical += sumBy(own, (ride) => ride.verticalFt);
      if (own.length > bestDateRides) {
        bestDateRides = own.length;
        bestDate = date;
      }
    }
    rows.push({
      lift: lift.code,
      name: lift.name,
      daysTurning,
      rides,
      verticalFt: vertical,
      bestDate,
      bestDateRides,
    });
  }
  return rows.sort((a, b) => b.rides - a.rides || a.lift.localeCompare(b.lift));
}
