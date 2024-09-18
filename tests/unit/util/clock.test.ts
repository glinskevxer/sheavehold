import { describe, expect, it } from 'vitest';
import {
  addOperatingDays,
  formatAreaTime,
  fromAreaClock,
  isDaylight,
  minutesIntoOperatingDay,
  offsetMinutesAt,
  operatingDateRange,
  operatingDay,
  operatingDayBounds,
  operatingDaysBetween,
  parseOperatingDate,
  toAreaClock,
  type OperatingDate,
} from '../../../src/util/clock.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

const day = (raw: string): OperatingDate => expectOk(parseOperatingDate(raw), 'date');

describe('area time', () => {
  it('is on standard time in January and daylight time in July', () => {
    expect(isDaylight(new Date('2025-01-15T18:00:00Z'))).toBe(false);
    expect(isDaylight(new Date('2025-07-15T18:00:00Z'))).toBe(true);
    expect(offsetMinutesAt(new Date('2025-01-15T18:00:00Z'))).toBe(-420);
    expect(offsetMinutesAt(new Date('2025-07-15T18:00:00Z'))).toBe(-360);
  });

  it('switches at two in the morning on the second sunday in March', () => {
    expect(isDaylight(new Date('2025-03-09T08:59:00Z'))).toBe(false);
    expect(isDaylight(new Date('2025-03-09T09:01:00Z'))).toBe(true);
  });

  it('switches back on the first sunday in November', () => {
    expect(isDaylight(new Date('2025-11-02T07:59:00Z'))).toBe(true);
    expect(isDaylight(new Date('2025-11-02T08:01:00Z'))).toBe(false);
  });

  it('turns an instant into the local wall clock', () => {
    const clock = toAreaClock(new Date('2025-02-14T16:30:00Z'));
    expect(clock).toMatchObject({ year: 2025, month: 2, day: 14, hour: 9, minute: 30 });
    expect(clock.daylight).toBe(false);
  });

  it('round trips a wall clock through an instant', () => {
    const instant = fromAreaClock(2025, 2, 14, 9, 30, 0);
    expect(instant.toISOString()).toBe('2025-02-14T16:30:00.000Z');
    expect(toAreaClock(instant)).toMatchObject({ hour: 9, minute: 30 });
  });
});

describe('the operating day', () => {
  it('puts a night ski scan on the day it started', () => {
    expect(operatingDay(new Date('2025-01-14T04:15:00Z'))).toBe('2025-01-13');
    expect(operatingDay(new Date('2025-01-14T11:15:00Z'))).toBe('2025-01-14');
  });

  it('rolls over at four in the morning local, not at midnight', () => {
    expect(operatingDay(new Date('2025-01-14T10:59:00Z'))).toBe('2025-01-13');
    expect(operatingDay(new Date('2025-01-14T11:01:00Z'))).toBe('2025-01-14');
  });

  it('gives half open bounds that tile with the next day', () => {
    const first = operatingDayBounds(day('2025-01-13'));
    const second = operatingDayBounds(day('2025-01-14'));
    expect(first.end.getTime()).toBe(second.start.getTime());
    expect(first.start.toISOString()).toBe('2025-01-13T11:00:00.000Z');
  });

  it('keeps a twenty three hour day over the spring transition', () => {
    const bounds = operatingDayBounds(day('2025-03-08'));
    const hours = (bounds.end.getTime() - bounds.start.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it('refuses a date that is not a real day', () => {
    expect(isErr(parseOperatingDate('2025-02-30'))).toBe(true);
    expect(isErr(parseOperatingDate('2025-13-01'))).toBe(true);
    expect(isErr(parseOperatingDate('14/01/2025'))).toBe(true);
  });

  it('walks days and counts the gap between them', () => {
    expect(addOperatingDays(day('2025-02-27'), 3)).toBe('2025-03-02');
    expect(addOperatingDays(day('2025-01-01'), -1)).toBe('2024-12-31');
    expect(operatingDaysBetween(day('2025-01-01'), day('2025-01-31'))).toBe(30);
  });

  it('builds a range inclusive on both ends and nothing when reversed', () => {
    expect(operatingDateRange(day('2025-01-01'), day('2025-01-04'))).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
      '2025-01-04',
    ]);
    expect(operatingDateRange(day('2025-01-04'), day('2025-01-01'))).toEqual([]);
  });

  it('measures minutes from the boundary rather than from midnight', () => {
    expect(minutesIntoOperatingDay(new Date('2025-01-13T11:00:00Z'))).toBe(0);
    expect(minutesIntoOperatingDay(new Date('2025-01-13T16:30:00Z'))).toBe(330);
    expect(minutesIntoOperatingDay(new Date('2025-01-14T04:00:00Z'))).toBe(1020);
  });

  it('prints the zone abbreviation the ops team writes on paper', () => {
    expect(formatAreaTime(new Date('2025-01-14T16:05:09Z'))).toBe('2025-01-14 09:05:09 MST');
    expect(formatAreaTime(new Date('2025-07-14T16:05:09Z'))).toBe('2025-07-14 10:05:09 MDT');
  });
});
