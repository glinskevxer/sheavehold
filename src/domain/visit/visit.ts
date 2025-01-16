import type { OperatingDate } from '../../util/clock.js';
import type { LiftCode } from '../../util/ids.js';
import { distinctSorted, groupBy, sumBy } from '../../util/collect.js';
import { compareRides, totalVerticalFt, type Ride } from '../ride/ride.js';

/**
 * A skier visit is the number the industry reports and the one the board asks
 * about, and it is deliberately coarse: one person using the area for any part
 * of one operating day is one visit, whether they took two rides or ninety.
 *
 * Inside a visit are sessions. A guest who skis the morning, drives into town
 * for lunch and comes back for night skiing has one visit and two sessions, and
 * both numbers matter. The visit count is what gets reported. The session
 * shapes are what tells the food and beverage manager when the deck fills up.
 */

export interface Session {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly rideCount: number;
  readonly verticalFt: number;
  readonly lifts: readonly LiftCode[];
}

export interface Visit {
  readonly id: string;
  readonly guestId: string;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly operatingDate: OperatingDate;
  readonly firstRideAt: Date;
  readonly lastRideAt: Date;
  readonly rideCount: number;
  readonly verticalFt: number;
  readonly lifts: readonly LiftCode[];
  readonly sessions: readonly Session[];
  /** First to last ride, which is not the same as time spent skiing. */
  readonly spanMinutes: number;
}

/** Longer than this between two rides and the guest went and did something else. */
export const DEFAULT_SESSION_GAP_MINUTES = 150;

export interface VisitOptions {
  readonly sessionGapMinutes?: number | undefined;
}

export function visitId(date: OperatingDate, guestId: string, entitlementId: string): string {
  return `V-${date}-${guestId}-${entitlementId}`;
}

function sessionOf(rides: readonly Ride[]): Session {
  const first = rides[0];
  const last = rides[rides.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('a session cannot be built from no rides');
  }
  return {
    startedAt: first.boardedAt,
    endedAt: last.unloadsAt,
    rideCount: rides.length,
    verticalFt: totalVerticalFt(rides),
    lifts: distinctSorted(rides, (ride) => ride.lift) as LiftCode[],
  };
}

function splitSessions(rides: readonly Ride[], gapMinutes: number): Session[] {
  const sessions: Session[] = [];
  let current: Ride[] = [];
  for (const ride of rides) {
    const previous = current[current.length - 1];
    if (previous !== undefined) {
      const gap = (ride.boardedAt.getTime() - previous.boardedAt.getTime()) / 60_000;
      if (gap > gapMinutes) {
        sessions.push(sessionOf(current));
        current = [];
      }
    }
    current.push(ride);
  }
  if (current.length > 0) sessions.push(sessionOf(current));
  return sessions;
}

/**
 * One visit per guest per entitlement per operating day. The entitlement is in
 * the key on purpose: a guest who burns the last day of a three day ticket in
 * the morning and buys a fresh day ticket at lunch has bought two things and
 * the revenue side has to see both.
 */
export function buildVisits(rides: readonly Ride[], options: VisitOptions = {}): Visit[] {
  const gapMinutes = options.sessionGapMinutes ?? DEFAULT_SESSION_GAP_MINUTES;
  const groups = groupBy(rides, (ride) =>
    visitId(ride.operatingDate, ride.guestId, ride.entitlementId),
  );

  const visits: Visit[] = [];
  for (const [id, own] of groups) {
    const ordered = [...own].sort(compareRides);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first === undefined || last === undefined) continue;
    visits.push({
      id,
      guestId: first.guestId,
      entitlementId: first.entitlementId,
      productCode: first.productCode,
      operatingDate: first.operatingDate,
      firstRideAt: first.boardedAt,
      lastRideAt: last.boardedAt,
      rideCount: ordered.length,
      verticalFt: totalVerticalFt(ordered),
      lifts: distinctSorted(ordered, (ride) => ride.lift) as LiftCode[],
      sessions: splitSessions(ordered, gapMinutes),
      spanMinutes: Math.round((last.boardedAt.getTime() - first.boardedAt.getTime()) / 60_000),
    });
  }

  return visits.sort(
    (a, b) =>
      a.operatingDate.localeCompare(b.operatingDate) ||
      a.firstRideAt.getTime() - b.firstRideAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export function visitsOn(visits: readonly Visit[], date: OperatingDate): Visit[] {
  return visits.filter((visit) => visit.operatingDate === date);
}

/** The headline number. One person on one day counts once, not once per pass. */
export function skierVisits(visits: readonly Visit[], date: OperatingDate): number {
  return new Set(visitsOn(visits, date).map((visit) => visit.guestId)).size;
}

export function visitsOfGuest(visits: readonly Visit[], guestId: string): Visit[] {
  return visits.filter((visit) => visit.guestId === guestId);
}

export function daysSkied(visits: readonly Visit[], guestId: string): OperatingDate[] {
  return [...new Set(visitsOfGuest(visits, guestId).map((visit) => visit.operatingDate))].sort();
}

export function visitsOfEntitlement(visits: readonly Visit[], entitlementId: string): Visit[] {
  return visits.filter((visit) => visit.entitlementId === entitlementId);
}

/** Guests who took exactly one ride, which is usually a gate or a refund. */
export function singleRideVisits(visits: readonly Visit[]): Visit[] {
  return visits.filter((visit) => visit.rideCount === 1);
}

export function averageRidesPerVisit(visits: readonly Visit[]): number {
  if (visits.length === 0) return 0;
  const total = sumBy(visits, (visit) => visit.rideCount);
  return Math.round((total / visits.length) * 10) / 10;
}
