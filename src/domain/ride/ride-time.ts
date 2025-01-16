import { groupBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import type { Lift, LiftRegistry } from '../lift/lift.js';
import { compareRides, type Ride } from './ride.js';

/**
 * The design ride time on the lift record is what the lift does at full speed
 * with nobody on it. Real ride time is longer: lifts run slow in wind, they
 * stop for a load, and the old double on Bowl has spent whole seasons at two
 * thirds speed with nobody writing it down.
 *
 * There is no sensor telling us the rope speed, so we infer it from the guests.
 * The shortest turnaround anybody manages on a lift is the ride plus the
 * fastest possible descent plus no line at all, so the distribution of
 * turnarounds has a hard floor and that floor moves with the rope speed.
 */

export interface Turnaround {
  readonly lift: LiftCode;
  readonly guestId: string;
  readonly minutes: number;
}

/** Consecutive rides by the same guest on the same lift, back to back. */
export function turnarounds(rides: readonly Ride[]): Turnaround[] {
  const byGuest = groupBy(rides, (ride) => ride.guestId);
  const out: Turnaround[] = [];
  for (const [guestId, own] of byGuest) {
    const ordered = [...own].sort(compareRides);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      const current = ordered[i];
      if (previous === undefined || current === undefined) continue;
      if (previous.lift !== current.lift) continue;
      const minutes = (current.boardedAt.getTime() - previous.boardedAt.getTime()) / 60_000;
      if (minutes <= 0) continue;
      out.push({ lift: current.lift, guestId, minutes });
    }
  }
  return out;
}

export function percentile(values: readonly number[], fraction: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

/** How many turnarounds a lift needs before its floor means anything. */
export const MIN_TURNAROUNDS = 8;

/**
 * The fastest lap anybody managed, taken as the fifth percentile rather than
 * the outright minimum so that one guest who scanned at the bottom of the
 * download gate does not set the number for the whole day.
 */
export function fastestLapMinutes(rides: readonly Ride[], lift: LiftCode): number | undefined {
  const minutes = turnarounds(rides)
    .filter((entry) => entry.lift === lift)
    .map((entry) => entry.minutes);
  if (minutes.length < MIN_TURNAROUNDS) return undefined;
  return percentile(minutes, 0.05);
}

/**
 * Ratio of observed to design. One means the lift ran at its rated speed, and
 * anything above one means it ran slow. Clamped, because a lap includes a ski
 * down we cannot measure and a wild ratio is a measurement fault.
 */
export const MIN_SPEED_FACTOR = 0.8;
export const MAX_SPEED_FACTOR = 2.5;

export function speedFactor(lift: Lift, fastestLap: number | undefined): number {
  if (fastestLap === undefined) return 1;
  const descent = Math.max(1, lift.rideMinutes * 0.45);
  const impliedRide = fastestLap - descent;
  if (impliedRide <= 0) return 1;
  const factor = impliedRide / lift.rideMinutes;
  return Math.min(MAX_SPEED_FACTOR, Math.max(MIN_SPEED_FACTOR, Math.round(factor * 100) / 100));
}

export interface LiftSpeedReading {
  readonly lift: LiftCode;
  readonly designMinutes: number;
  readonly observedMinutes: number;
  readonly factor: number;
  readonly sampleSize: number;
  readonly confident: boolean;
}

/**
 * One reading per lift that turned. Lifts with too few laps to say anything
 * are still reported, with `confident` false and a factor of one, because a
 * missing row on the sheet reads as a lift that did not run.
 */
export class LiftSpeedModel {
  private readonly readings = new Map<string, LiftSpeedReading>();

  static observe(rides: readonly Ride[], lifts: LiftRegistry): LiftSpeedModel {
    const model = new LiftSpeedModel();
    const laps = turnarounds(rides);
    for (const lift of lifts.all()) {
      const own = laps.filter((entry) => entry.lift === lift.code).map((entry) => entry.minutes);
      const ridden = rides.some((ride) => ride.lift === lift.code);
      if (!ridden) continue;
      const fastest = own.length >= MIN_TURNAROUNDS ? percentile(own, 0.05) : undefined;
      const factor = speedFactor(lift, fastest);
      model.readings.set(lift.code, {
        lift: lift.code,
        designMinutes: lift.rideMinutes,
        observedMinutes: Math.round(lift.rideMinutes * factor * 10) / 10,
        factor,
        sampleSize: own.length,
        confident: fastest !== undefined,
      });
    }
    return model;
  }

  reading(lift: LiftCode): LiftSpeedReading | undefined {
    return this.readings.get(lift);
  }

  factorFor(lift: LiftCode): number {
    return this.readings.get(lift)?.factor ?? 1;
  }

  all(): LiftSpeedReading[] {
    return [...this.readings.values()].sort((a, b) => a.lift.localeCompare(b.lift));
  }

  /** Lifts running more than a tenth slow, which is a maintenance question. */
  runningSlow(threshold = 1.1): LiftSpeedReading[] {
    return this.all().filter((reading) => reading.confident && reading.factor >= threshold);
  }

  get size(): number {
    return this.readings.size;
  }
}

/** Where the guest actually is, once the lift speed has been taken in. */
export function unloadEstimate(ride: Ride, model: LiftSpeedModel): Date {
  const minutes = ride.rideMinutes * model.factorFor(ride.lift);
  return new Date(ride.boardedAt.getTime() + minutes * 60_000);
}

/** Rides still on the wire at a given moment, which is the evacuation list. */
export function ridingAt(rides: readonly Ride[], at: Date, model: LiftSpeedModel): Ride[] {
  return rides
    .filter((ride) => {
      const boarded = ride.boardedAt.getTime();
      return boarded <= at.getTime() && unloadEstimate(ride, model).getTime() > at.getTime();
    })
    .sort(compareRides);
}
