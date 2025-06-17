import type { OperatingDate } from '../../util/clock.js';
import { sumBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import type { OperatingDayPlan } from '../calendar/season.js';
import { scheduledMinutes } from '../calendar/season.js';
import {
  designCapacityPerHour,
  verticalRiseFt,
  type Lift,
  type LiftRegistry,
} from '../lift/lift.js';
import type { Ride } from '../ride/ride.js';
import { hourlyProfile, hourOf } from './capacity.js';

/**
 * Utilisation is delivered over design, and every argument about it is an
 * argument about the denominator.
 *
 * A lift that did not turn at all contributes nothing to either side. A lift
 * that turned for one hour contributes one hour of design capacity, not a whole
 * day of it. Doing it the other way put the area at nine percent utilisation on
 * a powder Saturday, which nobody believed and which was correct arithmetic on
 * the wrong denominator.
 */

export interface LiftUtilisation {
  readonly lift: LiftCode;
  readonly name: string;
  readonly hoursTurning: number;
  readonly ridesCarried: number;
  readonly designCapacity: number;
  readonly utilisationPercent: number;
  readonly peakHourRides: number;
  readonly peakHourPercent: number;
  readonly verticalFt: number;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function liftUtilisation(lift: Lift, rides: readonly Ride[]): LiftUtilisation {
  const own = rides.filter((ride) => ride.lift === lift.code);
  const buckets = hourlyProfile(own);
  const perHour = designCapacityPerHour(lift);
  const design = perHour * buckets.length;
  const peak = buckets.reduce((best, bucket) => Math.max(best, bucket.rides), 0);
  return {
    lift: lift.code,
    name: lift.name,
    hoursTurning: buckets.length,
    ridesCarried: own.length,
    designCapacity: design,
    utilisationPercent: percent(own.length, design),
    peakHourRides: peak,
    peakHourPercent: percent(peak, perHour),
    verticalFt: sumBy(own, (ride) => ride.verticalFt),
  };
}

export interface AreaUtilisation {
  readonly date: OperatingDate;
  readonly liftsTurning: number;
  readonly ridesCarried: number;
  readonly designCapacity: number;
  readonly utilisationPercent: number;
  readonly scheduledMinutes: number;
  /** Design capacity if every in service lift had turned all day. */
  readonly theoreticalCapacity: number;
  readonly lifts: readonly LiftUtilisation[];
}

export function areaUtilisation(
  date: OperatingDate,
  rides: readonly Ride[],
  lifts: LiftRegistry,
  plan: OperatingDayPlan,
): AreaUtilisation {
  const rows = lifts
    .all()
    .filter((lift) => lift.status !== 'retired')
    .map((lift) => liftUtilisation(lift, rides))
    .filter((row) => row.hoursTurning > 0)
    .sort((a, b) => b.ridesCarried - a.ridesCarried || a.lift.localeCompare(b.lift));

  const design = sumBy(rows, (row) => row.designCapacity);
  const scheduled = scheduledMinutes(plan);
  const theoretical =
    (scheduled / 60) * sumBy(lifts.inService(), (lift) => designCapacityPerHour(lift));

  return {
    date,
    liftsTurning: rows.length,
    ridesCarried: rides.length,
    designCapacity: design,
    utilisationPercent: percent(rides.length, design),
    scheduledMinutes: scheduled,
    theoreticalCapacity: Math.round(theoretical),
    lifts: rows,
  };
}

/** Feet of rise the area could have carried in the hours it actually turned. */
export function verticalCapacityDelivered(
  rides: readonly Ride[],
  lifts: LiftRegistry,
): { delivered: number; design: number; percent: number } {
  let design = 0;
  for (const lift of lifts.all()) {
    const own = rides.filter((ride) => ride.lift === lift.code);
    const hours = hourlyProfile(own).length;
    design += designCapacityPerHour(lift) * verticalRiseFt(lift) * hours;
  }
  const delivered = sumBy(rides, (ride) => ride.verticalFt);
  return { delivered, design, percent: percent(delivered, design) };
}

/** Hours where one lift went over the share of design a queue starts at. */
export function pinchedHours(
  lift: Lift,
  rides: readonly Ride[],
  threshold = 70,
): { hour: number; rides: number; percent: number }[] {
  const perHour = designCapacityPerHour(lift);
  return hourlyProfile(rides.filter((ride) => ride.lift === lift.code))
    .map((bucket) => ({
      hour: bucket.hour,
      rides: bucket.rides,
      percent: percent(bucket.rides, perHour),
    }))
    .filter((row) => row.percent >= threshold);
}

export function hoursCovered(rides: readonly Ride[]): number[] {
  return [...new Set(rides.map(hourOf))].sort((a, b) => a - b);
}
