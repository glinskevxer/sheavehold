import { describe, expect, it } from 'vitest';
import { buildDailyReport } from '../../../src/report/daily.js';
import {
  REPORT_WIRE_VERSION,
  renderDailyJson,
  toDailyReportJson,
} from '../../../src/report/json.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = (date = '2025-01-13') => buildDailyReport(day(date), reportContext());

describe('the wire shape', () => {
  it('carries a version so a change is visible', () => {
    expect(toDailyReportJson(report()).version).toBe(REPORT_WIRE_VERSION);
    expect(REPORT_WIRE_VERSION).toBe(2);
  });

  it('turns every date into a string', () => {
    const wire = toDailyReportJson(report());
    expect(wire.date).toBe('2025-01-13');
    expect(wire.generatedAt).toBe('2025-01-14T15:00:00.000Z');
  });

  it('groups the totals rather than spreading them', () => {
    expect(toDailyReportJson(report()).totals).toEqual({
      skierVisits: 2,
      visits: 2,
      rides: 5,
      verticalFt: 4480,
      scans: 5,
      liftsTurning: 2,
      ridesPerVisit: 2.5,
      verticalPerVisit: 2240,
    });
  });

  it('gives money both ways', () => {
    const revenue = toDailyReportJson(report()).revenue;
    expect(revenue.cents).toBe(124400);
    expect(revenue.formatted).toBe('$1,244.00');
    expect(revenue.perVisitCents).toBe(62200);
  });

  it('carries the utilisation numbers', () => {
    const utilisation = toDailyReportJson(report()).utilisation;
    expect(utilisation.scheduledMinutes).toBe(420);
    expect(utilisation.theoreticalCapacity).toBeGreaterThan(0);
  });

  it('gives a row per lift and a bucket per hour', () => {
    const wire = toDailyReportJson(report());
    expect(wire.lifts).toHaveLength(6);
    expect(wire.lifts[0]).toEqual({
      code: 'SUNB',
      name: 'Sunburst',
      turned: true,
      rides: 3,
      riders: 1,
      verticalFt: 3720,
      sharePercent: 60,
    });
    expect(wire.hours[0]?.label).toBe('10:00');
  });

  it('counts the exceptions', () => {
    expect(toDailyReportJson(report()).exceptions).toEqual({ open: 1, high: 0 });
  });

  it('gives a quiet day empty arrays rather than nothing', () => {
    const wire = toDailyReportJson(report('2025-01-14'));
    expect(wire.hours).toEqual([]);
    expect(wire.totals.rides).toBe(0);
  });
});

describe('rendering', () => {
  it('round trips through JSON', () => {
    const wire = toDailyReportJson(report());
    expect(JSON.parse(renderDailyJson(report()))).toEqual(wire);
  });

  it('indents when asked', () => {
    expect(renderDailyJson(report(), true).split('\n').length).toBeGreaterThan(10);
    expect(renderDailyJson(report()).split('\n')).toHaveLength(1);
  });
});
