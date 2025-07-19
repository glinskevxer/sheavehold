import { describe, expect, it } from 'vitest';
import {
  buildUtilisationReport,
  describeWorstHour,
  hourLabels,
  pinchPoint,
  renderUtilisationReport,
} from '../../../src/report/utilisation.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = (threshold = 70) =>
  buildUtilisationReport(day('2025-01-13'), day('2025-01-15'), reportContext(), threshold);

describe('building the report', () => {
  it('gives a row for every lift that is not retired', () => {
    expect(report().rows).toHaveLength(6);
  });

  it('counts the days and hours a lift turned', () => {
    const sunb = report().rows.find((row) => row.lift === 'SUNB');
    expect(sunb).toMatchObject({ daysTurning: 1, hoursTurning: 2, ridesCarried: 3 });
    expect(sunb?.designPerHour).toBe(2400);
  });

  it('gives a lift that never turned zeroes', () => {
    const bowl = report().rows.find((row) => row.lift === 'BOWL');
    expect(bowl).toMatchObject({ daysTurning: 0, ridesCarried: 0, averagePercent: 0 });
    expect(bowl?.worstDate).toBeUndefined();
  });

  it('names the day a lift was busiest', () => {
    const sunb = report().rows.find((row) => row.lift === 'SUNB');
    expect(sunb?.worstDate).toBe('2025-01-13');
    expect(describeWorstHour(sunb!)).toBe('SUNB was busiest on 2025-01-13');
  });

  it('says so about a lift that never turned', () => {
    const bowl = report().rows.find((row) => row.lift === 'BOWL')!;
    expect(describeWorstHour(bowl)).toBe('BOWL never turned');
  });

  it('finds no pinch at a sensible threshold', () => {
    expect(report().rows.every((row) => row.pinchedHours === 0)).toBe(true);
    expect(pinchPoint(report())).toBeUndefined();
  });

  it('finds one once the threshold is low enough to bite', () => {
    const low = report(0.05);
    expect(pinchPoint(low)?.lift).toBeDefined();
    expect(pinchPoint(low)?.pinchedHours).toBeGreaterThan(0);
    expect(pinchPoint(low)?.pinchedDays).toBe(1);
  });

  it('gives an area average over the capacity that was turning', () => {
    expect(report().areaAverage).toBeGreaterThan(0);
    expect(report().areaAverage).toBeLessThan(1);
  });

  it('gives nothing for a period with no traffic', () => {
    const empty = buildUtilisationReport(day('2025-02-01'), day('2025-02-03'), reportContext());
    expect(empty.areaAverage).toBe(0);
    expect(empty.rows.every((row) => row.daysTurning === 0)).toBe(true);
  });
});

describe('rendering the report', () => {
  it('opens with the period and explains the threshold', () => {
    const lines = renderUtilisationReport(report());
    expect(lines[0]).toBe('lift utilisation  2025-01-13 to 2025-01-15');
    expect(lines[1]).toContain('70% of design capacity');
  });

  it('prints a table with the columns the committee reads', () => {
    const lines = renderUtilisationReport(report());
    const header = lines[3];
    expect(header?.trim().split(/\s+/)).toEqual([
      'lift',
      'name',
      'pph',
      'days',
      'hours',
      'rides',
      'avg',
      'peak',
      'pinched',
    ]);
  });

  it('closes with the area average', () => {
    const lines = renderUtilisationReport(report());
    expect(lines[lines.length - 1]).toContain('area average');
  });
});

describe('the hour labels', () => {
  it('turns hours from the rollover into clock times', () => {
    expect(hourLabels([5, 6, 16])).toEqual(['09:00', '10:00', '20:00']);
    expect(hourLabels([])).toEqual([]);
  });
});
