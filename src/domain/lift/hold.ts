import { minutesIntoOperatingDay, type OperatingDate } from '../../util/clock.js';
import { groupBy, sumBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';
import type { ClosureReason } from '../calendar/closure.js';
import type { Ride } from '../ride/ride.js';

/**
 * A hold is one lift stopped for a stretch of the day, which is the ordinary
 * case: the gondola goes on wind hold at eleven and comes off at one while
 * everything else keeps turning. The day is not closed and the area still
 * carried people, but the gondola's utilisation denominator has to shrink or it
 * reads as though nobody wanted to ride it.
 *
 * Holds are logged by the lift operator on paper and typed in afterwards, so
 * they overlap, they run past the last lift, and two of them cover the same
 * hour. All three are handled rather than refused.
 */

export interface Hold {
  readonly lift: LiftCode;
  readonly date: OperatingDate;
  /** Minutes from the 04:00 boundary, so it lines up with everything else. */
  readonly fromMinute: number;
  readonly toMinute: number;
  readonly reason: ClosureReason;
  readonly note: string;
}

export interface HoldInput {
  readonly lift: LiftCode;
  readonly date: OperatingDate;
  readonly fromMinute: number;
  readonly toMinute: number;
  readonly reason: ClosureReason;
  readonly note?: string | undefined;
}

export function makeHold(input: HoldInput): Result<Hold> {
  if (!Number.isInteger(input.fromMinute) || input.fromMinute < 0) {
    return err(`a hold cannot start at minute ${input.fromMinute}`);
  }
  if (!Number.isInteger(input.toMinute) || input.toMinute <= input.fromMinute) {
    return err(`a hold on ${input.lift} ends at or before it starts`);
  }
  return ok({
    lift: input.lift,
    date: input.date,
    fromMinute: input.fromMinute,
    toMinute: input.toMinute,
    reason: input.reason,
    note: input.note?.trim() ?? '',
  });
}

export function holdMinutes(hold: Hold): number {
  return hold.toMinute - hold.fromMinute;
}

export function coversMinute(hold: Hold, minute: number): boolean {
  return minute >= hold.fromMinute && minute < hold.toMinute;
}

/** Overlapping holds merged into the stretches the lift was actually stopped. */
export function mergeHolds(holds: readonly Hold[]): { from: number; to: number }[] {
  const ordered = [...holds].sort((a, b) => a.fromMinute - b.fromMinute);
  const out: { from: number; to: number }[] = [];
  for (const hold of ordered) {
    const last = out.at(-1);
    if (last !== undefined && hold.fromMinute <= last.to) {
      last.to = Math.max(last.to, hold.toMinute);
      continue;
    }
    out.push({ from: hold.fromMinute, to: hold.toMinute });
  }
  return out;
}

export function stoppedMinutes(holds: readonly Hold[]): number {
  return sumBy(mergeHolds(holds), (span) => span.to - span.from);
}

export class HoldLog {
  private readonly holds: Hold[] = [];

  static from(holds: readonly Hold[]): HoldLog {
    const log = new HoldLog();
    for (const hold of holds) log.add(hold);
    return log;
  }

  add(hold: Hold): void {
    this.holds.push(hold);
  }

  get size(): number {
    return this.holds.length;
  }

  all(): Hold[] {
    return [...this.holds].sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.lift.localeCompare(b.lift) || a.fromMinute - b.fromMinute,
    );
  }

  on(lift: LiftCode, date: OperatingDate): Hold[] {
    return this.all().filter((hold) => hold.lift === lift && hold.date === date);
  }

  /** Minutes a lift was stopped, with overlapping holds counted once. */
  stoppedOn(lift: LiftCode, date: OperatingDate): number {
    return stoppedMinutes(this.on(lift, date));
  }

  /** Minutes a lift could have run, given what it was scheduled for. */
  runningMinutes(lift: LiftCode, date: OperatingDate, scheduled: number): number {
    return Math.max(0, scheduled - this.stoppedOn(lift, date));
  }

  /**
   * Rides that boarded while their lift was supposedly stopped. Either the hold
   * was typed in wrong or the lift ran while the log says it did not, and both
   * are worth a word with the operator.
   */
  ridesDuringHolds(rides: readonly Ride[]): Ride[] {
    return rides.filter((ride) =>
      this.on(ride.lift, ride.operatingDate).some((hold) =>
        coversMinute(hold, minutesIntoOperatingDay(ride.boardedAt)),
      ),
    );
  }

  byLift(date: OperatingDate): Map<LiftCode, number> {
    const found = new Map<LiftCode, number>();
    const own = this.all().filter((hold) => hold.date === date);
    for (const [lift, holds] of groupBy(own, (hold) => hold.lift)) {
      found.set(lift, stoppedMinutes(holds));
    }
    return found;
  }

  worstOn(date: OperatingDate): LiftCode | undefined {
    let worst: LiftCode | undefined;
    let most = 0;
    for (const [lift, minutes] of this.byLift(date)) {
      if (minutes > most) {
        worst = lift;
        most = minutes;
      }
    }
    return worst;
  }
}
