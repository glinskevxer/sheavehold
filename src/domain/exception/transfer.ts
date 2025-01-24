import { groupBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import type { LiftRegistry } from '../lift/lift.js';
import { compareRides, type Ride } from '../ride/ride.js';

/**
 * The other half of pass-back detection. One card boards Ridgeline at the base
 * and boards the North Bowl chair four minutes later. North Bowl loads at the
 * top of Ridgeline, and the ride up Ridgeline alone is eleven minutes, so the
 * card was in two places at once.
 *
 * This needs a table of how long it actually takes to get from one lift to
 * another, and there is no way to derive that from elevations. The ski patrol
 * director walked it and wrote the numbers down, and they live in a table the
 * mountain manager edits. A pair with no entry raises nothing, deliberately:
 * inventing a number here would flag traverses nobody has measured.
 */

export interface TransferEntry {
  readonly from: LiftCode;
  readonly to: LiftCode;
  /** Fastest anybody gets from unloading `from` to boarding `to`. */
  readonly minutes: number;
}

export class TransferMap {
  private readonly minutes = new Map<string, number>();

  static from(entries: readonly TransferEntry[]): TransferMap {
    const map = new TransferMap();
    for (const entry of entries) map.set(entry.from, entry.to, entry.minutes);
    return map;
  }

  private static key(from: LiftCode, to: LiftCode): string {
    return `${from}>${to}`;
  }

  set(from: LiftCode, to: LiftCode, minutes: number): void {
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new Error(`transfer ${from} to ${to} takes ${minutes} minutes`);
    }
    this.minutes.set(TransferMap.key(from, to), minutes);
  }

  get(from: LiftCode, to: LiftCode): number | undefined {
    return this.minutes.get(TransferMap.key(from, to));
  }

  has(from: LiftCode, to: LiftCode): boolean {
    return this.minutes.has(TransferMap.key(from, to));
  }

  get size(): number {
    return this.minutes.size;
  }

  /** Pairs the table has no entry for, which is a list to walk with a radio. */
  missingPairs(lifts: LiftRegistry): TransferEntry[] {
    const running = lifts.inService();
    const gaps: TransferEntry[] = [];
    for (const from of running) {
      for (const to of running) {
        if (from.code === to.code) continue;
        if (this.has(from.code, to.code)) continue;
        gaps.push({ from: from.code, to: to.code, minutes: Number.NaN });
      }
    }
    return gaps;
  }
}

export interface TransferFinding {
  readonly mediaSerial: string;
  readonly guestId: string;
  readonly fromLift: LiftCode;
  readonly toLift: LiftCode;
  readonly firstRideId: string;
  readonly secondRideId: string;
  readonly gapMinutes: number;
  readonly requiredMinutes: number;
  readonly shortfallMinutes: number;
}

export interface TransferOptions {
  readonly lifts: LiftRegistry;
  readonly transfers: TransferMap;
  /** Add the ride time of the first lift before the walk. On by default. */
  readonly includeRideTime?: boolean | undefined;
}

/**
 * The required gap is the ride up the first lift plus the measured traverse.
 * A guest who boarded the first lift and is at the second one sooner than that
 * cannot have ridden the first one, so somebody else is holding the card.
 */
export function requiredTransferMinutes(
  first: Ride,
  second: Ride,
  options: TransferOptions,
): number | undefined {
  const walk = options.transfers.get(first.lift, second.lift);
  if (walk === undefined) return undefined;
  const includeRide = options.includeRideTime ?? true;
  const ride = includeRide ? (options.lifts.find(first.lift)?.rideMinutes ?? 0) : 0;
  return Math.round((ride + walk) * 10) / 10;
}

export function findImpossibleTransfers(
  rides: readonly Ride[],
  options: TransferOptions,
): TransferFinding[] {
  const findings: TransferFinding[] = [];

  for (const own of groupBy(rides, (ride) => ride.mediaSerial).values()) {
    const ordered = [...own].sort(compareRides);
    for (let i = 1; i < ordered.length; i += 1) {
      const first = ordered[i - 1];
      const second = ordered[i];
      if (first === undefined || second === undefined) continue;
      if (first.lift === second.lift) continue;

      const required = requiredTransferMinutes(first, second, options);
      if (required === undefined) continue;
      const gap = (second.boardedAt.getTime() - first.boardedAt.getTime()) / 60_000;
      if (gap >= required) continue;

      findings.push({
        mediaSerial: second.mediaSerial,
        guestId: second.guestId,
        fromLift: first.lift,
        toLift: second.lift,
        firstRideId: first.id,
        secondRideId: second.id,
        gapMinutes: Math.round(gap * 10) / 10,
        requiredMinutes: required,
        shortfallMinutes: Math.round((required - gap) * 10) / 10,
      });
    }
  }

  return findings.sort(
    (a, b) => b.shortfallMinutes - a.shortfallMinutes || a.firstRideId.localeCompare(b.firstRideId),
  );
}

/** The worst shortfall on a card, which is what the register sorts on. */
export function worstShortfall(findings: readonly TransferFinding[]): TransferFinding | undefined {
  return findings[0];
}
