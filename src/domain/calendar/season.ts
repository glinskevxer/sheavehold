import {
  addOperatingDays,
  operatingDateParts,
  operatingDateRange,
  operatingDaysBetween,
  parseOperatingDate,
  type OperatingDate,
} from '../../util/clock.js';
import { err, ok, type Result } from '../../util/result.js';
import { SheaveholdError } from '../../util/diagnostic.js';

/**
 * The season calendar. Two things hang off it and both are load bearing.
 *
 * The first is whether the area was open at all, because every utilisation
 * figure divides by scheduled hours and a closed day has to leave the
 * denominator alone rather than push it to zero.
 *
 * The second is the day class. Peak, holiday, weekend and midweek decide what a
 * ticket cost and which blackouts bite, so the same media on the same lift is
 * worth different money on two consecutive days.
 */

export type DayClass = 'midweek' | 'weekend' | 'holiday' | 'peak';

export type DayStatus = 'scheduled' | 'closed' | 'weather_hold';

export interface OperatingDayPlan {
  readonly date: OperatingDate;
  readonly status: DayStatus;
  readonly dayClass: DayClass;
  /** Minutes after the 04:00 boundary that the first lift turns. */
  readonly firstLiftMinute: number;
  /** Minutes after the boundary that the last lift stops loading. */
  readonly lastLiftMinute: number;
  readonly nightSkiing: boolean;
  readonly note: string;
}

export interface SeasonInput {
  readonly name: string;
  readonly opensOn: string;
  readonly closesOn: string;
}

export interface Season {
  readonly name: string;
  readonly opensOn: OperatingDate;
  readonly closesOn: OperatingDate;
}

const DAY_CLASSES: readonly DayClass[] = ['midweek', 'weekend', 'holiday', 'peak'];

export function isDayClass(value: string): value is DayClass {
  return (DAY_CLASSES as readonly string[]).includes(value);
}

export function makeSeason(input: SeasonInput): Result<Season> {
  if (input.name.trim() === '') return err('a season needs a name');
  const opensOn = parseOperatingDate(input.opensOn);
  if (!opensOn.ok) return opensOn;
  const closesOn = parseOperatingDate(input.closesOn);
  if (!closesOn.ok) return closesOn;
  const span = operatingDaysBetween(opensOn.value, closesOn.value);
  if (span < 0) return err(`season ${input.name} closes before it opens`);
  if (span > 300) return err(`season ${input.name} runs ${span + 1} days`);
  return ok({ name: input.name.trim(), opensOn: opensOn.value, closesOn: closesOn.value });
}

/** Saturday or Sunday in the area's own zone. */
export function isWeekend(date: OperatingDate): boolean {
  const { year, month, day } = operatingDateParts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function defaultDayClass(date: OperatingDate): DayClass {
  return isWeekend(date) ? 'weekend' : 'midweek';
}

export const DEFAULT_FIRST_LIFT_MINUTE = 300;
export const DEFAULT_LAST_LIFT_MINUTE = 720;
export const NIGHT_LAST_LIFT_MINUTE = 1020;

export function defaultPlan(date: OperatingDate): OperatingDayPlan {
  return {
    date,
    status: 'scheduled',
    dayClass: defaultDayClass(date),
    firstLiftMinute: DEFAULT_FIRST_LIFT_MINUTE,
    lastLiftMinute: DEFAULT_LAST_LIFT_MINUTE,
    nightSkiing: false,
    note: '',
  };
}

export function scheduledMinutes(plan: OperatingDayPlan): number {
  if (plan.status !== 'scheduled') return 0;
  const last = plan.nightSkiing
    ? Math.max(plan.lastLiftMinute, NIGHT_LAST_LIFT_MINUTE)
    : plan.lastLiftMinute;
  return Math.max(0, last - plan.firstLiftMinute);
}

export interface DayOverride {
  readonly status?: DayStatus;
  readonly dayClass?: DayClass;
  readonly firstLiftMinute?: number;
  readonly lastLiftMinute?: number;
  readonly nightSkiing?: boolean;
  readonly note?: string;
}

/**
 * Built from a season and a sparse set of overrides. Days nobody wrote a note
 * about get the default plan, which is what the marketing calendar assumes.
 */
export class OperatingCalendar {
  private readonly overrides = new Map<string, DayOverride>();

  constructor(readonly season: Season) {}

  static from(
    season: Season,
    overrides: Readonly<Record<string, DayOverride>> = {},
  ): OperatingCalendar {
    const calendar = new OperatingCalendar(season);
    for (const [date, override] of Object.entries(overrides)) {
      const parsed = parseOperatingDate(date);
      if (!parsed.ok) {
        throw new SheaveholdError('calendar.bad_date', parsed.error, { date });
      }
      calendar.override(parsed.value, override);
    }
    return calendar;
  }

  override(date: OperatingDate, override: DayOverride): void {
    if (!this.covers(date)) {
      throw new SheaveholdError(
        'calendar.outside_season',
        `${date} is outside ${this.season.name}`,
        {
          date,
          season: this.season.name,
        },
      );
    }
    this.overrides.set(date, { ...this.overrides.get(date), ...override });
  }

  covers(date: OperatingDate): boolean {
    return (
      operatingDaysBetween(this.season.opensOn, date) >= 0 &&
      operatingDaysBetween(date, this.season.closesOn) >= 0
    );
  }

  plan(date: OperatingDate): OperatingDayPlan {
    const base = defaultPlan(date);
    const override = this.overrides.get(date);
    if (override === undefined) return base;
    return {
      date,
      status: override.status ?? base.status,
      dayClass: override.dayClass ?? base.dayClass,
      firstLiftMinute: override.firstLiftMinute ?? base.firstLiftMinute,
      lastLiftMinute: override.lastLiftMinute ?? base.lastLiftMinute,
      nightSkiing: override.nightSkiing ?? base.nightSkiing,
      note: override.note ?? base.note,
    };
  }

  isOperating(date: OperatingDate): boolean {
    return this.covers(date) && this.plan(date).status === 'scheduled';
  }

  dates(): OperatingDate[] {
    return operatingDateRange(this.season.opensOn, this.season.closesOn);
  }

  operatingDates(): OperatingDate[] {
    return this.dates().filter((date) => this.isOperating(date));
  }

  closedDates(): OperatingDate[] {
    return this.dates().filter((date) => !this.isOperating(date));
  }

  datesOfClass(dayClass: DayClass): OperatingDate[] {
    return this.dates().filter((date) => this.plan(date).dayClass === dayClass);
  }

  /** Scheduled lift minutes across the season, the utilisation denominator. */
  totalScheduledMinutes(): number {
    return this.dates().reduce((total, date) => total + scheduledMinutes(this.plan(date)), 0);
  }

  /** How far into the season a date sits, one based, counting operating days. */
  dayNumber(date: OperatingDate): number {
    if (!this.covers(date)) return 0;
    let count = 0;
    for (let cursor = this.season.opensOn; ; cursor = addOperatingDays(cursor, 1)) {
      if (this.isOperating(cursor)) count += 1;
      if (cursor === date) return this.isOperating(cursor) ? count : 0;
      if (operatingDaysBetween(cursor, this.season.closesOn) <= 0) return 0;
    }
  }
}
