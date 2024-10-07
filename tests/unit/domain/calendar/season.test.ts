import { describe, expect, it } from 'vitest';
import {
  defaultDayClass,
  defaultPlan,
  isDayClass,
  isWeekend,
  makeSeason,
  OperatingCalendar,
  scheduledMinutes,
} from '../../../../src/domain/calendar/season.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { calendar2024, day, SEASON_2024 } from '../../../support/season.js';

describe('the season', () => {
  it('reads its two dates and trims the name', () => {
    const season = expectOk(
      makeSeason({ name: '  2024/25 ', opensOn: '2024-11-22', closesOn: '2025-04-13' }),
      'season',
    );
    expect(season.name).toBe('2024/25');
    expect(season.opensOn).toBe('2024-11-22');
  });

  it('refuses a season with no name, bad dates or the wrong order', () => {
    expect(isErr(makeSeason({ name: ' ', opensOn: '2024-11-22', closesOn: '2025-04-13' }))).toBe(
      true,
    );
    expect(isErr(makeSeason({ name: 'x', opensOn: 'later', closesOn: '2025-04-13' }))).toBe(true);
    expect(isErr(makeSeason({ name: 'x', opensOn: '2024-11-22', closesOn: 'nope' }))).toBe(true);
    expect(isErr(makeSeason({ name: 'x', opensOn: '2025-04-13', closesOn: '2024-11-22' }))).toBe(
      true,
    );
  });

  it('refuses a season longer than a year of skiing', () => {
    expect(isErr(makeSeason({ name: 'x', opensOn: '2024-01-01', closesOn: '2024-12-31' }))).toBe(
      true,
    );
  });
});

describe('day classes', () => {
  it('knows a weekend from a midweek day', () => {
    expect(isWeekend(day('2025-01-11'))).toBe(true);
    expect(isWeekend(day('2025-01-12'))).toBe(true);
    expect(isWeekend(day('2025-01-13'))).toBe(false);
    expect(defaultDayClass(day('2025-01-13'))).toBe('midweek');
    expect(defaultDayClass(day('2025-01-11'))).toBe('weekend');
  });

  it('recognises the classes we price on', () => {
    expect(isDayClass('peak')).toBe(true);
    expect(isDayClass('shoulder')).toBe(false);
  });

  it('gives a default plan that opens at nine and stops at four', () => {
    const plan = defaultPlan(day('2025-01-13'));
    expect(plan.firstLiftMinute).toBe(300);
    expect(plan.lastLiftMinute).toBe(720);
    expect(scheduledMinutes(plan)).toBe(420);
  });

  it('runs a night ski day out to nine in the evening', () => {
    const plan = { ...defaultPlan(day('2025-01-10')), nightSkiing: true };
    expect(scheduledMinutes(plan)).toBe(720);
  });

  it('schedules nothing on a closed or held day', () => {
    expect(scheduledMinutes({ ...defaultPlan(day('2024-12-03')), status: 'closed' })).toBe(0);
    expect(scheduledMinutes({ ...defaultPlan(day('2025-01-11')), status: 'weather_hold' })).toBe(0);
  });
});

describe('the calendar', () => {
  const calendar = calendar2024();

  it('covers the season and nothing outside it', () => {
    expect(calendar.covers(day('2024-11-22'))).toBe(true);
    expect(calendar.covers(day('2025-04-13'))).toBe(true);
    expect(calendar.covers(day('2024-11-21'))).toBe(false);
    expect(calendar.covers(day('2025-04-14'))).toBe(false);
  });

  it('refuses an override outside the season', () => {
    expect(() => calendar.override(day('2025-05-01'), { status: 'closed' })).toThrow(
      'outside 2024/25',
    );
  });

  it('layers an override onto the default plan', () => {
    const plan = calendar.plan(day('2025-01-20'));
    expect(plan.dayClass).toBe('holiday');
    expect(plan.note).toBe('martin luther king day');
    expect(plan.firstLiftMinute).toBe(300);
  });

  it('leaves an untouched day on its defaults', () => {
    expect(calendar.plan(day('2025-02-04'))).toEqual(defaultPlan(day('2025-02-04')));
  });

  it('merges two overrides on the same day', () => {
    const one = OperatingCalendar.from(SEASON_2024, { '2025-01-15': { dayClass: 'peak' } });
    one.override(day('2025-01-15'), { note: 'race week' });
    expect(one.plan(day('2025-01-15'))).toMatchObject({ dayClass: 'peak', note: 'race week' });
  });

  it('refuses a badly shaped date in the override map', () => {
    expect(() => OperatingCalendar.from(SEASON_2024, { yesterday: {} })).toThrow('YYYY-MM-DD');
  });

  it('separates the days it ran from the days it did not', () => {
    expect(calendar.isOperating(day('2024-12-03'))).toBe(false);
    expect(calendar.isOperating(day('2025-01-11'))).toBe(false);
    expect(calendar.isOperating(day('2025-01-12'))).toBe(true);
    expect(calendar.closedDates()).toEqual(['2024-12-03', '2025-01-11']);
    expect(calendar.dates()).toHaveLength(143);
    expect(calendar.operatingDates()).toHaveLength(141);
  });

  it('collects the days of one class', () => {
    expect(calendar.datesOfClass('peak')).toHaveLength(12);
    expect(calendar.datesOfClass('holiday')).toEqual([
      '2025-01-18',
      '2025-01-19',
      '2025-01-20',
      '2025-02-15',
      '2025-02-16',
      '2025-02-17',
    ]);
  });

  it('adds the scheduled minutes and skips the closed days', () => {
    const nights = 4 * 300;
    expect(calendar.totalScheduledMinutes()).toBe(141 * 420 + nights);
  });

  it('numbers the operating days and gives nothing for a closed one', () => {
    expect(calendar.dayNumber(day('2024-11-22'))).toBe(1);
    expect(calendar.dayNumber(day('2024-11-23'))).toBe(2);
    expect(calendar.dayNumber(day('2024-12-03'))).toBe(0);
    expect(calendar.dayNumber(day('2024-12-04'))).toBe(12);
    expect(calendar.dayNumber(day('2025-05-01'))).toBe(0);
  });
});
