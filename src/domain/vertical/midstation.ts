import { groupBy, sumBy } from '../../util/collect.js';
import type { LiftRegistry } from '../lift/lift.js';
import { midStationRiseFt, verticalRiseFt } from '../lift/lift.js';
import { compareRides, type Ride } from '../ride/ride.js';

/**
 * The gondola has a mid station and people get off at it. They are skiing the
 * lower half, they are not riding to the top, and crediting them the full rise
 * puts several hundred thousand feet a season into the marketing email that
 * nobody actually skied.
 *
 * There is no gate at the mid station, so this is inferred. A guest who gets
 * off at mid can only be back at the bottom terminal quickly, because the run
 * from mid to the base is short. A guest who rode to the top cannot be back
 * inside the top to base descent time however hard they ski. The threshold is
 * the descent time from the top, which we take from the lift record rather
 * than from anybody's opinion.
 */

export interface MidStationAdjustment {
  readonly rideId: string;
  readonly guestId: string;
  readonly fullRiseFt: number;
  readonly creditedFt: number;
  readonly nextRideAfterMinutes: number;
}

export interface MidStationResult {
  readonly rides: readonly Ride[];
  readonly adjustments: readonly MidStationAdjustment[];
}

export interface MidStationOptions {
  readonly lifts: LiftRegistry;
  /**
   * Descent time from the top, as a multiple of the design ride time. A guest
   * back at the gate faster than ride plus this cannot have been to the top.
   */
  readonly descentFactor?: number | undefined;
}

export const DEFAULT_DESCENT_FACTOR = 0.5;

export function applyMidStationUnloads(
  rides: readonly Ride[],
  options: MidStationOptions,
): MidStationResult {
  const factor = options.descentFactor ?? DEFAULT_DESCENT_FACTOR;
  const ordered = [...rides].sort(compareRides);
  const byGuest = groupBy(ordered, (ride) => ride.guestId);

  const adjustments: MidStationAdjustment[] = [];
  const credited = new Map<string, number>();

  for (const own of byGuest.values()) {
    for (let i = 0; i < own.length - 1; i += 1) {
      const ride = own[i];
      const next = own[i + 1];
      if (ride === undefined || next === undefined) continue;
      if (next.lift !== ride.lift) continue;
      const lift = options.lifts.find(ride.lift);
      if (lift === undefined) continue;
      const midRise = midStationRiseFt(lift);
      if (midRise === undefined) continue;

      const gapMinutes = (next.boardedAt.getTime() - ride.boardedAt.getTime()) / 60_000;
      const fullLap = lift.rideMinutes * (1 + factor);
      if (gapMinutes >= fullLap) continue;

      credited.set(ride.id, midRise);
      adjustments.push({
        rideId: ride.id,
        guestId: ride.guestId,
        fullRiseFt: verticalRiseFt(lift),
        creditedFt: midRise,
        nextRideAfterMinutes: Math.round(gapMinutes * 10) / 10,
      });
    }
  }

  const adjusted = ordered.map((ride) => {
    const feet = credited.get(ride.id);
    return feet === undefined ? ride : { ...ride, verticalFt: feet };
  });

  return { rides: adjusted, adjustments };
}

export function adjustedRideIds(result: MidStationResult): string[] {
  return result.adjustments.map((entry) => entry.rideId).sort();
}

/** Feet the inference took back off the season total. */
export function verticalReclaimedFt(result: MidStationResult): number {
  return sumBy(result.adjustments, (entry) => entry.fullRiseFt - entry.creditedFt);
}
