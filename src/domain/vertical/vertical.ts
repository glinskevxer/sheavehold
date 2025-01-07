import type { OperatingDate } from '../../util/clock.js';
import type { LiftCode } from '../../util/ids.js';
import { compareRides, type Ride } from '../ride/ride.js';

/**
 * Vertical is the number guests care about and the one marketing puts on the
 * end of season email, so it has to be defensible. Three rules, and all three
 * came out of an argument with a guest holding a printout.
 *
 * A ride credits the full rise of the lift, once. Two rides on the same lift in
 * the same minute credit twice only if both survived dedupe. A download never
 * credits anything, which is why download gates never become rides at all.
 */

export interface VerticalRow {
  readonly key: string;
  readonly rideCount: number;
  readonly verticalFt: number;
}

export interface VerticalLedgerOptions {
  /** Cap a single guest's day, because a stuck gate can invent a mile of it. */
  readonly dailyCapFt?: number | undefined;
}

/** Nobody skis this in a day. Above it the reading is a fault, not a feat. */
export const IMPLAUSIBLE_DAILY_VERTICAL_FT = 90_000;

function accumulate(
  rides: readonly Ride[],
  keyOf: (ride: Ride) => string,
): Map<string, VerticalRow> {
  const rows = new Map<string, VerticalRow>();
  for (const ride of rides) {
    const key = keyOf(ride);
    const row = rows.get(key) ?? { key, rideCount: 0, verticalFt: 0 };
    rows.set(key, {
      key,
      rideCount: row.rideCount + 1,
      verticalFt: row.verticalFt + ride.verticalFt,
    });
  }
  return rows;
}

function sortRows(rows: Iterable<VerticalRow>): VerticalRow[] {
  return [...rows].sort((a, b) => b.verticalFt - a.verticalFt || a.key.localeCompare(b.key));
}

export function verticalByGuest(rides: readonly Ride[]): VerticalRow[] {
  return sortRows(accumulate(rides, (ride) => ride.guestId).values());
}

export function verticalByLift(rides: readonly Ride[]): VerticalRow[] {
  return sortRows(accumulate(rides, (ride) => ride.lift).values());
}

export function verticalByDate(rides: readonly Ride[]): VerticalRow[] {
  return [...accumulate(rides, (ride) => ride.operatingDate).values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

export function verticalByProduct(rides: readonly Ride[]): VerticalRow[] {
  return sortRows(accumulate(rides, (ride) => ride.productCode).values());
}

export function totalVertical(rides: readonly Ride[]): number {
  return rides.reduce((total, ride) => total + ride.verticalFt, 0);
}

/** A guest's vertical on one day, which is what the leaderboard ranks. */
export function guestDayVertical(
  rides: readonly Ride[],
  guestId: string,
  date: OperatingDate,
): number {
  return totalVertical(
    rides.filter((ride) => ride.guestId === guestId && ride.operatingDate === date),
  );
}

export function cumulativeVertical(rides: readonly Ride[], guestId: string): VerticalRow[] {
  const own = rides.filter((ride) => ride.guestId === guestId).sort(compareRides);
  const rows: VerticalRow[] = [];
  let running = 0;
  let count = 0;
  let currentDate: string | undefined;
  for (const ride of own) {
    running += ride.verticalFt;
    count += 1;
    if (ride.operatingDate !== currentDate) {
      currentDate = ride.operatingDate;
      rows.push({ key: ride.operatingDate, rideCount: count, verticalFt: running });
      continue;
    }
    rows[rows.length - 1] = { key: ride.operatingDate, rideCount: count, verticalFt: running };
  }
  return rows;
}

export interface LeaderboardEntry {
  readonly guestId: string;
  readonly date: OperatingDate;
  readonly verticalFt: number;
  readonly rideCount: number;
  readonly lifts: number;
  readonly capped: boolean;
}

/**
 * Best days on the mountain. Capped rather than dropped, because a day over the
 * cap is nearly always a real day plus a stuck gate, and dropping it loses the
 * real part along with the noise.
 */
export function leaderboard(
  rides: readonly Ride[],
  options: VerticalLedgerOptions & { readonly limit?: number | undefined } = {},
): LeaderboardEntry[] {
  const cap = options.dailyCapFt ?? IMPLAUSIBLE_DAILY_VERTICAL_FT;
  const groups = new Map<string, Ride[]>();
  for (const ride of rides) {
    const key = `${ride.guestId}#${ride.operatingDate}`;
    groups.set(key, [...(groups.get(key) ?? []), ride]);
  }
  const entries: LeaderboardEntry[] = [];
  for (const own of groups.values()) {
    const first = own[0];
    if (first === undefined) continue;
    const raw = totalVertical(own);
    entries.push({
      guestId: first.guestId,
      date: first.operatingDate,
      verticalFt: Math.min(raw, cap),
      rideCount: own.length,
      lifts: new Set(own.map((ride) => ride.lift)).size,
      capped: raw > cap,
    });
  }
  entries.sort(
    (a, b) =>
      b.verticalFt - a.verticalFt ||
      a.date.localeCompare(b.date) ||
      a.guestId.localeCompare(b.guestId),
  );
  const limit = options.limit ?? entries.length;
  return entries.slice(0, Math.max(0, limit));
}

/** Feet per hour on the hill, which reads high for anybody who lapped a poma. */
export function verticalPerHour(rides: readonly Ride[]): number {
  if (rides.length < 2) return 0;
  const ordered = [...rides].sort(compareRides);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return 0;
  const hours = (last.boardedAt.getTime() - first.boardedAt.getTime()) / 3_600_000;
  if (hours <= 0) return 0;
  return Math.round(totalVertical(ordered) / hours);
}

/** Guests whose day is over the cap, which is a gate to walk up to. */
export function implausibleDays(
  rides: readonly Ride[],
  options: VerticalLedgerOptions = {},
): LeaderboardEntry[] {
  return leaderboard(rides, options).filter((entry) => entry.capped);
}

export function shareOfVertical(rides: readonly Ride[], lift: LiftCode): number {
  const total = totalVertical(rides);
  if (total === 0) return 0;
  const own = totalVertical(rides.filter((ride) => ride.lift === lift));
  return Math.round((own / total) * 1000) / 10;
}
