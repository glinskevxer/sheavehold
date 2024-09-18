import { err, ok, type Result } from './result.js';

/**
 * The area sits in mountain time and every terminal reports an instant, so
 * everything the business cares about needs converting into the local wall
 * clock before it means anything. We do not pull a timezone database in for
 * this. The area is in one zone, it has never moved, and the two transition
 * rules have been stable since 2007.
 *
 * The other half of this file is the operating day. A ski day does not start at
 * midnight. Night skiing runs to 21:00 and the groomers are on the hill until
 * the small hours, so the day rolls over at 04:00 local. A scan at 02:15 on the
 * 14th belongs to the 13th, and every report in this codebase agrees on that.
 */

export const STANDARD_OFFSET_MINUTES = -420;
export const DAYLIGHT_OFFSET_MINUTES = -360;
export const OPERATING_DAY_BOUNDARY_HOUR = 4;

/** A calendar date in the area's own zone, YYYY-MM-DD. */
export type OperatingDate = string & { readonly __operatingDate: unique symbol };

export interface AreaClock {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
  /** 1 to 31. */
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly offsetMinutes: number;
  readonly daylight: boolean;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The nth given weekday of a month, as a UTC midnight instant. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + shift + (nth - 1) * 7));
}

/**
 * Daylight saving starts at 02:00 local standard on the second Sunday in March
 * and ends at 02:00 local daylight on the first Sunday in November.
 */
export function isDaylight(instant: Date): boolean {
  const year = instant.getUTCFullYear();
  const marchSunday = nthWeekday(year, 3, 0, 2);
  const novemberSunday = nthWeekday(year, 11, 0, 1);
  const start =
    marchSunday.getTime() + 2 * 60 * MS_PER_MINUTE - STANDARD_OFFSET_MINUTES * MS_PER_MINUTE;
  const end =
    novemberSunday.getTime() + 2 * 60 * MS_PER_MINUTE - DAYLIGHT_OFFSET_MINUTES * MS_PER_MINUTE;
  const t = instant.getTime();
  return t >= start && t < end;
}

export function offsetMinutesAt(instant: Date): number {
  return isDaylight(instant) ? DAYLIGHT_OFFSET_MINUTES : STANDARD_OFFSET_MINUTES;
}

export function toAreaClock(instant: Date): AreaClock {
  const daylight = isDaylight(instant);
  const offsetMinutes = daylight ? DAYLIGHT_OFFSET_MINUTES : STANDARD_OFFSET_MINUTES;
  const shifted = new Date(instant.getTime() + offsetMinutes * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    offsetMinutes,
    daylight,
  };
}

/**
 * Local wall clock back to an instant. Ambiguous times in the autumn fall back
 * on the daylight reading, which is the earlier of the two, because that is
 * what a gate reporting local time would have meant when it wrote the row.
 */
export function fromAreaClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = new Date(naive - DAYLIGHT_OFFSET_MINUTES * MS_PER_MINUTE);
  const offset = offsetMinutesAt(guess);
  return new Date(naive - offset * MS_PER_MINUTE);
}

export function parseOperatingDate(raw: string): Result<OperatingDate> {
  const match = DATE_PATTERN.exec(raw.trim());
  if (match === null) return err(`date ${JSON.stringify(raw)} is not YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return err(`month ${month} is out of range in ${raw}`);
  if (day < 1 || day > daysInMonth(year, month)) return err(`day ${day} is out of range in ${raw}`);
  return ok(`${match[1]}-${match[2]}-${match[3]}` as OperatingDate);
}

export function operatingDateParts(date: OperatingDate): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_PATTERN.exec(date);
  if (match === null) throw new Error(`operating date ${date} lost its shape`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDate(year: number, month: number, day: number): OperatingDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}` as OperatingDate;
}

/** The operating day an instant falls in, rolling over at 04:00 local. */
export function operatingDay(instant: Date): OperatingDate {
  const clock = toAreaClock(instant);
  if (clock.hour >= OPERATING_DAY_BOUNDARY_HOUR) {
    return formatDate(clock.year, clock.month, clock.day);
  }
  const previous = new Date(Date.UTC(clock.year, clock.month - 1, clock.day) - MS_PER_DAY);
  return formatDate(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate());
}

/** Half open bounds of an operating day, 04:00 local to 04:00 local. */
export function operatingDayBounds(date: OperatingDate): { start: Date; end: Date } {
  const { year, month, day } = operatingDateParts(date);
  const start = fromAreaClock(year, month, day, OPERATING_DAY_BOUNDARY_HOUR);
  const next = new Date(Date.UTC(year, month - 1, day) + MS_PER_DAY);
  const end = fromAreaClock(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    OPERATING_DAY_BOUNDARY_HOUR,
  );
  return { start, end };
}

export function addOperatingDays(date: OperatingDate, days: number): OperatingDate {
  const { year, month, day } = operatingDateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function operatingDaysBetween(from: OperatingDate, to: OperatingDate): number {
  const a = operatingDateParts(from);
  const b = operatingDateParts(to);
  const left = Date.UTC(a.year, a.month - 1, a.day);
  const right = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((right - left) / MS_PER_DAY);
}

/** Inclusive on both ends, which is how every report period in here reads. */
export function operatingDateRange(from: OperatingDate, to: OperatingDate): OperatingDate[] {
  const span = operatingDaysBetween(from, to);
  if (span < 0) return [];
  const out: OperatingDate[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addOperatingDays(from, i));
  return out;
}

/** Minutes since the 04:00 boundary, which is what the hour buckets index on. */
export function minutesIntoOperatingDay(instant: Date): number {
  const day = operatingDay(instant);
  const { start } = operatingDayBounds(day);
  return Math.floor((instant.getTime() - start.getTime()) / MS_PER_MINUTE);
}

export function formatAreaTime(instant: Date): string {
  const c = toAreaClock(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  const zone = c.daylight ? 'MDT' : 'MST';
  const hms = `${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`;
  return `${formatDate(c.year, c.month, c.day)} ${hms} ${zone}`;
}
