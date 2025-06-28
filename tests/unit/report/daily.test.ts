import { describe, expect, it } from 'vitest';
import {
  buildDailyReport,
  firstAndLast,
  oneLine,
  unexplainedIdleLifts,
} from '../../../src/report/daily.js';
import { GENERATED_AT, reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

describe('building the daily report', () => {
  const report = () => buildDailyReport(day('2025-01-13'), reportContext());

  it('carries the day and when it was made', () => {
    expect(report().date).toBe('2025-01-13');
    expect(report().generatedAt).toBe(GENERATED_AT);
  });

  it('carries the summary the query service produced', () => {
    const built = report();
    expect(built.summary.rides).toBe(5);
    expect(built.summary.skierVisits).toBe(2);
  });

  it('carries a row for every lift that could have run', () => {
    expect(report().lifts).toHaveLength(6);
    expect(report().lifts[0]?.lift).toBe('SUNB');
  });

  it('carries the hourly profile', () => {
    const hourly = report().hourly;
    expect(hourly.map((bucket) => bucket.hour)).toEqual([6, 8]);
    expect(hourly[0]?.rides).toBe(4);
  });

  it('carries the utilisation and the revenue', () => {
    const built = report();
    expect(built.utilisation.liftsTurning).toBe(2);
    expect(built.revenue).toBeGreaterThan(0);
    expect(built.revenuePerVisit).toBeGreaterThan(0);
  });

  it('counts the open exceptions', () => {
    const built = report();
    expect(built.openExceptions).toBe(1);
    expect(built.highExceptions).toBe(0);
  });

  it('lays the headline out as label and value pairs', () => {
    const headline = report().headline;
    expect(headline.map(([label]) => label)).toEqual([
      'skier visits',
      'rides',
      'vertical feet',
      'lifts turning',
      'utilisation',
      'revenue',
      'open exceptions',
    ]);
    expect(headline[0]?.[1]).toBe('2');
    expect(headline[5]?.[1]?.startsWith('$')).toBe(true);
  });

  it('stamps now when nobody said when', () => {
    const context = { ...reportContext() };
    delete (context as { generatedAt?: Date }).generatedAt;
    const before = Date.now();
    expect(
      buildDailyReport(day('2025-01-13'), context).generatedAt.getTime(),
    ).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('the one line summary', () => {
  it('describes a working day', () => {
    expect(oneLine(buildDailyReport(day('2025-01-13'), reportContext()))).toBe(
      '2025-01-13: 2 visits, 5 rides, 2 lifts',
    );
  });

  it('says so when the area was held', () => {
    expect(oneLine(buildDailyReport(day('2025-01-11'), reportContext()))).toBe(
      '2025-01-11: weather hold',
    );
  });

  it('says so when the area was open and nobody came', () => {
    expect(oneLine(buildDailyReport(day('2025-01-14'), reportContext()))).toBe(
      '2025-01-14: scheduled and nobody rode',
    );
  });
});

describe('the small helpers', () => {
  it('prints the first and last boarding in area time', () => {
    expect(firstAndLast(buildDailyReport(day('2025-01-13'), reportContext()))).toBe(
      '2025-01-13 10:00:08 MST to 2025-01-13 12:40:08 MST',
    );
  });

  it('says nothing turned on a quiet day', () => {
    expect(firstAndLast(buildDailyReport(day('2025-01-14'), reportContext()))).toBe(
      'nothing turned',
    );
  });

  it('lists the lifts that should have turned and did not', () => {
    const idle = unexplainedIdleLifts(buildDailyReport(day('2025-01-13'), reportContext()));
    expect(idle.map((row) => row.lift)).toEqual(['BOWL', 'CRPT', 'POMA', 'RIDGE']);
  });

  it('lists nothing on a day the area was shut', () => {
    expect(unexplainedIdleLifts(buildDailyReport(day('2025-01-11'), reportContext()))).toEqual([]);
  });
});
