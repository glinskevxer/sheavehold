import { operatingDateRange, type OperatingDate } from '../../util/clock.js';
import { groupBy, tallyBy } from '../../util/collect.js';
import { err, ok, type Result } from '../../util/result.js';
import { scheduledMinutes, type OperatingCalendar } from './season.js';

/**
 * A day the area did not run is not a day with no visits, and the difference
 * decides every average in the season report. Eleven wind days is a bad season;
 * eleven days nobody came is a different problem entirely, and the two used to
 * be indistinguishable because the calendar only said "closed".
 *
 * So a closure carries a reason and, when it is a partial day, the minutes it
 * actually cost. Those minutes come out of the denominator and nothing else.
 */

export type ClosureReason = 'wind' | 'no_snow' | 'power' | 'avalanche' | 'staffing' | 'other';

const REASONS: readonly ClosureReason[] = [
  'wind',
  'no_snow',
  'power',
  'avalanche',
  'staffing',
  'other',
];

export function isClosureReason(value: string): value is ClosureReason {
  return (REASONS as readonly string[]).includes(value);
}

export interface Closure {
  readonly date: OperatingDate;
  readonly reason: ClosureReason;
  /** Minutes lost. Zero means the whole scheduled day was lost. */
  readonly minutesLost: number;
  readonly note: string;
}

export interface ClosureInput {
  readonly date: OperatingDate;
  readonly reason: string;
  readonly minutesLost?: number | undefined;
  readonly note?: string | undefined;
}

export function makeClosure(input: ClosureInput): Result<Closure> {
  if (!isClosureReason(input.reason)) return err(`${input.reason} is not a closure reason`);
  const minutes = input.minutesLost ?? 0;
  if (!Number.isInteger(minutes) || minutes < 0) {
    return err(`a closure cannot cost ${minutes} minutes`);
  }
  return ok({
    date: input.date,
    reason: input.reason,
    minutesLost: minutes,
    note: input.note?.trim() ?? '',
  });
}

export class ClosureLog {
  private readonly byDate = new Map<string, Closure[]>();

  static from(closures: readonly Closure[]): ClosureLog {
    const log = new ClosureLog();
    for (const closure of closures) log.add(closure);
    return log;
  }

  add(closure: Closure): void {
    this.byDate.set(closure.date, [...(this.byDate.get(closure.date) ?? []), closure]);
  }

  on(date: OperatingDate): Closure[] {
    return this.byDate.get(date) ?? [];
  }

  get size(): number {
    return [...this.byDate.values()].reduce((total, own) => total + own.length, 0);
  }

  all(): Closure[] {
    return [...this.byDate.values()]
      .flat()
      .sort((a, b) => a.date.localeCompare(b.date) || a.reason.localeCompare(b.reason));
  }

  /**
   * Minutes the area actually offered on a day: what was scheduled, less what
   * the closures cost, never below zero.
   */
  minutesOffered(date: OperatingDate, calendar: OperatingCalendar): number {
    const plan = calendar.plan(date);
    const scheduled = scheduledMinutes(plan);
    if (scheduled === 0) return 0;
    const closures = this.on(date);
    if (closures.some((closure) => closure.minutesLost === 0)) return 0;
    const lost = closures.reduce((total, closure) => total + closure.minutesLost, 0);
    return Math.max(0, scheduled - lost);
  }

  minutesLost(from: OperatingDate, to: OperatingDate, calendar: OperatingCalendar): number {
    return operatingDateRange(from, to).reduce((total, date) => {
      const scheduled = scheduledMinutes(calendar.plan(date));
      return total + (scheduled - this.minutesOffered(date, calendar));
    }, 0);
  }

  byReason(): Map<ClosureReason, number> {
    return tallyBy(this.all(), (closure) => closure.reason);
  }

  daysLost(from: OperatingDate, to: OperatingDate, calendar: OperatingCalendar): OperatingDate[] {
    return operatingDateRange(from, to).filter(
      (date) =>
        scheduledMinutes(calendar.plan(date)) > 0 && this.minutesOffered(date, calendar) === 0,
    );
  }

  worstReason(): ClosureReason | undefined {
    const grouped = groupBy(this.all(), (closure) => closure.reason);
    let worst: ClosureReason | undefined;
    let most = 0;
    for (const [reason, own] of grouped) {
      if (own.length > most) {
        worst = reason;
        most = own.length;
      }
    }
    return worst;
  }
}
