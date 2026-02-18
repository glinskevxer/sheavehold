import { operatingDaysBetween, type OperatingDate } from '../util/clock.js';
import { distinctSorted, groupBy } from '../util/collect.js';
import type { LiftCode } from '../util/ids.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import type { Ride } from '../domain/ride/ride.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * The single number the ski school is judged on: how many people who started on
 * the carpet made it onto a real lift, and how long it took them.
 *
 * The trap in it is that a season pass holder who happens to ride the carpet
 * once with their child is not a beginner, and counting them as one made the
 * conversion rate look far worse than it was. So a beginner is somebody whose
 * first ever ride was on a beginner lift, and nothing else counts.
 */

export type Stage = 'beginner' | 'progressing' | 'graduated';

export interface ProgressionRow {
  readonly guestId: string;
  readonly firstDate: OperatingDate;
  readonly firstLift: LiftCode;
  readonly beginnerRides: number;
  readonly mainRides: number;
  readonly stage: Stage;
  /** Days from the first ride to the first ride on a lift that is not beginner. */
  readonly daysToGraduate: number | undefined;
  readonly graduatedOn: OperatingDate | undefined;
}

export interface ProgressionContext {
  readonly rides: RideStore;
  readonly lifts: LiftRegistry;
}

/** Somebody is progressing once they have ridden a beginner lift more than once. */
export const PROGRESSING_AFTER_RIDES = 2;

function stageOf(beginnerRides: number, mainRides: number): Stage {
  if (mainRides > 0) return 'graduated';
  if (beginnerRides >= PROGRESSING_AFTER_RIDES) return 'progressing';
  return 'beginner';
}

export function readProgression(
  guestId: string,
  rides: readonly Ride[],
  beginners: ReadonlySet<string>,
): ProgressionRow | undefined {
  const own = [...rides].sort((a, b) => a.boardedAt.getTime() - b.boardedAt.getTime());
  const first = own[0];
  if (first === undefined) return undefined;
  if (!beginners.has(first.lift)) return undefined;

  const beginnerRides = own.filter((ride) => beginners.has(ride.lift)).length;
  const main = own.filter((ride) => !beginners.has(ride.lift));
  const graduated = main[0];
  const days =
    graduated === undefined
      ? undefined
      : operatingDaysBetween(first.operatingDate, graduated.operatingDate);

  return {
    guestId,
    firstDate: first.operatingDate,
    firstLift: first.lift,
    beginnerRides,
    mainRides: main.length,
    stage: stageOf(beginnerRides, main.length),
    daysToGraduate: days,
    graduatedOn: graduated?.operatingDate,
  };
}

export function beginnerLiftCodes(lifts: LiftRegistry): Set<string> {
  return new Set(lifts.beginnerLifts().map((lift) => lift.code));
}

export function progressionRows(context: ProgressionContext): ProgressionRow[] {
  const beginners = beginnerLiftCodes(context.lifts);
  const rows: ProgressionRow[] = [];
  for (const [guestId, own] of groupBy(context.rides.rides.all(), (ride) => ride.guestId)) {
    const row = readProgression(guestId, own, beginners);
    if (row !== undefined) rows.push(row);
  }
  return rows.sort(
    (a, b) => a.firstDate.localeCompare(b.firstDate) || a.guestId.localeCompare(b.guestId),
  );
}

export interface ProgressionSummary {
  readonly beginners: number;
  readonly progressing: number;
  readonly graduated: number;
  readonly conversionPercent: number;
  readonly medianDaysToGraduate: number | undefined;
  readonly firstDates: readonly OperatingDate[];
}

export function summariseProgression(rows: readonly ProgressionRow[]): ProgressionSummary {
  const graduated = rows.filter((row) => row.stage === 'graduated');
  const days = graduated
    .map((row) => row.daysToGraduate)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);

  return {
    beginners: rows.filter((row) => row.stage === 'beginner').length,
    progressing: rows.filter((row) => row.stage === 'progressing').length,
    graduated: graduated.length,
    conversionPercent:
      rows.length === 0 ? 0 : Math.round((graduated.length / rows.length) * 1000) / 10,
    medianDaysToGraduate: days.length === 0 ? undefined : days[Math.floor(days.length / 2)],
    firstDates: distinctSorted(rows, (row) => row.firstDate) as OperatingDate[],
  };
}
