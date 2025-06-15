import { minutesIntoOperatingDay, type OperatingDate } from '../../util/clock.js';
import { groupBy, sumBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import type { Ride } from '../ride/ride.js';

/**
 * Uphill capacity is the industry number for how much mountain there is: people
 * per hour times vertical rise, summed over the lifts that are turning. What we
 * measure is what was actually carried, which is always well under it, and the
 * ratio of the two is the only honest answer to "was it busy".
 *
 * Hours are counted from the 04:00 rollover, not from midnight, so hour 5 is
 * the nine o'clock hour on an ordinary day. Every bucket in this file uses that
 * and nothing here ever looks at a wall clock hour.
 */

export interface HourBucket {
  /** Hours since the operating day boundary. */
  readonly hour: number;
  readonly rides: number;
  readonly riders: number;
  readonly verticalFt: number;
}

export function hourOf(ride: Ride): number {
  return Math.floor(minutesIntoOperatingDay(ride.boardedAt) / 60);
}

export function hourLabel(hour: number): string {
  const clockHour = (hour + 4) % 24;
  return `${String(clockHour).padStart(2, '0')}:00`;
}

/** One bucket per hour that carried anybody, in order. */
export function hourlyProfile(rides: readonly Ride[]): HourBucket[] {
  const buckets: HourBucket[] = [];
  for (const [hour, own] of groupBy(rides, hourOf)) {
    buckets.push({
      hour,
      rides: own.length,
      riders: new Set(own.map((ride) => ride.guestId)).size,
      verticalFt: sumBy(own, (ride) => ride.verticalFt),
    });
  }
  return buckets.sort((a, b) => a.hour - b.hour);
}

export function busiestHour(rides: readonly Ride[]): HourBucket | undefined {
  return hourlyProfile(rides).reduce<HourBucket | undefined>((best, bucket) => {
    if (best === undefined || bucket.rides > best.rides) return bucket;
    return best;
  }, undefined);
}

export interface LiftHourlyProfile {
  readonly lift: LiftCode;
  readonly buckets: readonly HourBucket[];
  readonly peakRides: number;
  readonly peakHour: number | undefined;
}

export function liftHourlyProfiles(rides: readonly Ride[]): LiftHourlyProfile[] {
  const out: LiftHourlyProfile[] = [];
  for (const [lift, own] of groupBy(rides, (ride) => ride.lift)) {
    const buckets = hourlyProfile(own);
    const peak = busiestHour(own);
    out.push({
      lift,
      buckets,
      peakRides: peak?.rides ?? 0,
      peakHour: peak?.hour,
    });
  }
  return out.sort((a, b) => b.peakRides - a.peakRides || a.lift.localeCompare(b.lift));
}

/** People carried uphill per hour, which is what a lift is rated in. */
export function ridesPerHourDelivered(rides: readonly Ride[], hour: number): number {
  return rides.filter((ride) => hourOf(ride) === hour).length;
}

export interface UphillDelivered {
  readonly date: OperatingDate;
  readonly rides: number;
  readonly verticalFt: number;
  /** Feet of rise carried per hour the area was actually turning. */
  readonly verticalPerHour: number;
  readonly hoursTurning: number;
}

export function uphillDelivered(date: OperatingDate, rides: readonly Ride[]): UphillDelivered {
  const buckets = hourlyProfile(rides);
  const vertical = sumBy(rides, (ride) => ride.verticalFt);
  return {
    date,
    rides: rides.length,
    verticalFt: vertical,
    verticalPerHour: buckets.length === 0 ? 0 : Math.round(vertical / buckets.length),
    hoursTurning: buckets.length,
  };
}
