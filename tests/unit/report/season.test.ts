import { describe, expect, it } from 'vitest';
import {
  buildSeasonReport,
  renderSeasonReport,
  revenuePerVisit,
} from '../../../src/report/season.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = (from = '2025-01-10', to = '2025-01-16') =>
  buildSeasonReport(day(from), day(to), reportContext());

describe('building the season report', () => {
  it('counts calendar days, scheduled days and days lost', () => {
    const built = report();
    expect(built.calendarDays).toBe(7);
    expect(built.scheduledDays).toBe(6);
    expect(built.daysLost).toBe(1);
  });

  it('counts only the days that carried anybody as open', () => {
    expect(report().daysOpen).toBe(1);
  });

  it('adds the visits, rides and vertical', () => {
    const built = report();
    expect(built.skierVisits).toBe(2);
    expect(built.rides).toBe(5);
    expect(built.verticalFt).toBe(4480);
  });

  it('averages over the days with traffic, not the calendar', () => {
    expect(report().averageVisits).toBe(2);
  });

  it('names the best day', () => {
    const built = report();
    expect(built.bestDate).toBe('2025-01-13');
    expect(built.bestVisits).toBe(2);
  });

  it('breaks the season down by day class', () => {
    const rows = report().byClass;
    expect(rows.map((row) => row.dayClass).sort()).toEqual(['midweek', 'weekend']);
    expect(rows.find((row) => row.dayClass === 'midweek')?.skierVisits).toBe(2);
  });

  it('carries the season revenue', () => {
    expect(report().revenue).toBe(89_900 + 34_500);
    expect(revenuePerVisit(report())).toBe(Math.round(124_400 / 2));
  });

  it('gives a period with nothing in it zeroes rather than nothing', () => {
    const empty = report('2025-02-01', '2025-02-05');
    expect(empty.daysOpen).toBe(0);
    expect(empty.averageVisits).toBe(0);
    expect(empty.bestDate).toBeUndefined();
    expect(revenuePerVisit(empty)).toBe(0);
  });
});

describe('rendering the season report', () => {
  it('opens with the period', () => {
    expect(renderSeasonReport(report())[0]).toBe('season to date  2025-01-10 to 2025-01-16');
  });

  it('lays the headline out as pairs', () => {
    const lines = renderSeasonReport(report());
    expect(lines.some((line) => line.trimStart().startsWith('days lost'))).toBe(true);
    expect(
      lines.some((line) => line.trimStart().startsWith('best day') && line.includes('2025-01-13')),
    ).toBe(true);
  });

  it('says so when there is no best day yet', () => {
    const lines = renderSeasonReport(report('2025-02-01', '2025-02-05'));
    expect(lines.some((line) => line.includes('none yet'))).toBe(true);
  });

  it('prints the day class table', () => {
    const lines = renderSeasonReport(report());
    const at = lines.indexOf('by day class');
    expect(lines[at + 1]?.trim().split(/\s+/)).toEqual([
      'class',
      'days',
      'visits',
      'avg',
      'rides',
      'vertical',
    ]);
  });
});
