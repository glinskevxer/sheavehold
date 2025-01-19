import { groupBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import type { LiftRegistry } from '../lift/lift.js';
import { compareRides, type Ride } from '../ride/ride.js';

/**
 * Pass-back is one person riding up, skiing down, handing the card back over
 * the fence to a friend, and the friend riding up on it. It is the single most
 * common revenue leak at a small area and the only signal we have is timing.
 *
 * The test is physical. A lap on a lift cannot be quicker than the ride plus
 * the fastest anybody skis the run under it. If the same media boards twice
 * inside that, either two people used it or the ride never happened. Either
 * way it is worth a supervisor looking at.
 *
 * The threshold is per lift and comes off the lift record. Using one number for
 * the whole mountain flagged half the carpet traffic and missed the gondola
 * entirely, which is how we ended up doing it this way.
 */

export type PassbackConfidence = 'certain' | 'likely' | 'possible';

export interface PassbackFinding {
  readonly mediaSerial: string;
  readonly guestId: string;
  readonly entitlementId: string;
  readonly lift: LiftCode;
  readonly firstRideId: string;
  readonly secondRideId: string;
  readonly gapMinutes: number;
  readonly minimumLapMinutes: number;
  readonly confidence: PassbackConfidence;
}

export interface PassbackOptions {
  readonly lifts: LiftRegistry;
  /**
   * Fastest descent as a fraction of the design ride time. A racer on a
   * groomed run does the vertical in about a third of the time the lift takes.
   */
  readonly descentFraction?: number | undefined;
  /** Below this fraction of the minimum lap, the ride cannot have happened. */
  readonly certainFraction?: number | undefined;
}

export const DEFAULT_DESCENT_FRACTION = 0.35;
export const DEFAULT_CERTAIN_FRACTION = 0.5;

export function minimumLapMinutes(rideMinutes: number, descentFraction: number): number {
  return Math.round(rideMinutes * (1 + descentFraction) * 10) / 10;
}

function confidenceOf(gap: number, minimum: number, certainFraction: number): PassbackConfidence {
  if (gap <= minimum * certainFraction) return 'certain';
  if (gap <= minimum * 0.8) return 'likely';
  return 'possible';
}

export function findSameLiftPassbacks(
  rides: readonly Ride[],
  options: PassbackOptions,
): PassbackFinding[] {
  const descentFraction = options.descentFraction ?? DEFAULT_DESCENT_FRACTION;
  const certainFraction = options.certainFraction ?? DEFAULT_CERTAIN_FRACTION;
  const findings: PassbackFinding[] = [];

  for (const own of groupBy(rides, (ride) => ride.mediaSerial).values()) {
    const ordered = [...own].sort(compareRides);
    for (let i = 1; i < ordered.length; i += 1) {
      const first = ordered[i - 1];
      const second = ordered[i];
      if (first === undefined || second === undefined) continue;
      if (first.lift !== second.lift) continue;
      const lift = options.lifts.find(second.lift);
      if (lift === undefined) continue;

      const minimum = minimumLapMinutes(lift.rideMinutes, descentFraction);
      const gap = (second.boardedAt.getTime() - first.boardedAt.getTime()) / 60_000;
      if (gap >= minimum) continue;

      findings.push({
        mediaSerial: second.mediaSerial,
        guestId: second.guestId,
        entitlementId: second.entitlementId,
        lift: second.lift,
        firstRideId: first.id,
        secondRideId: second.id,
        gapMinutes: Math.round(gap * 10) / 10,
        minimumLapMinutes: minimum,
        confidence: confidenceOf(gap, minimum, certainFraction),
      });
    }
  }

  return findings.sort(
    (a, b) =>
      a.mediaSerial.localeCompare(b.mediaSerial) || a.firstRideId.localeCompare(b.firstRideId),
  );
}

export function passbacksOfConfidence(
  findings: readonly PassbackFinding[],
  confidence: PassbackConfidence,
): PassbackFinding[] {
  return findings.filter((finding) => finding.confidence === confidence);
}

/** Media with more than one finding, which is where a supervisor starts. */
export function repeatOffenders(findings: readonly PassbackFinding[]): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.mediaSerial, (counts.get(finding.mediaSerial) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([serial]) => serial)
    .sort();
}
