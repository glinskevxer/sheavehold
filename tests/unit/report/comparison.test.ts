import { describe, expect, it } from 'vitest';
import {
  alignedPeriod,
  buildComparison,
  notableChanges,
  renderComparison,
} from '../../../src/report/comparison.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = () =>
  buildComparison(day('2025-01-13'), day('2025-01-15'), day('2025-01-06'), reportContext());

const overlapping = () =>
  buildComparison(day('2025-01-13'), day('2025-01-15'), day('2025-01-13'), reportContext());

describe('lining two periods up', () => {
  it('runs the earlier one for the same number of days', () => {
    expect(alignedPeriod(day('2025-01-13'), day('2025-01-15'), day('2025-01-06'))).toEqual({
      from: '2025-01-06',
      to: '2025-01-08',
      days: 3,
    });
  });

  it('handles a single day period', () => {
    expect(alignedPeriod(day('2025-01-13'), day('2025-01-13'), day('2025-01-06'))).toMatchObject({
      to: '2025-01-06',
      days: 1,
    });
  });
});

describe('building the comparison', () => {
  it('carries both season reports', () => {
    const built = report();
    expect(built.current.from).toBe('2025-01-13');
    expect(built.previous.from).toBe('2025-01-06');
    expect(built.alignedDays).toBe(3);
  });

  it('compares the six numbers the board asks about', () => {
    expect(report().changes.map((entry) => entry.label)).toEqual([
      'skier visits',
      'rides',
      'vertical feet',
      'days with traffic',
      'days lost',
      'revenue',
    ]);
  });

  it('gives a delta and a percentage when both sides have something', () => {
    const visits = overlapping().changes.find((entry) => entry.label === 'skier visits');
    expect(visits).toMatchObject({ now: 2, before: 2, delta: 0, percent: 0 });
  });

  it('leaves the percentage off when last time had nothing', () => {
    const visits = report().changes.find((entry) => entry.label === 'skier visits');
    expect(visits?.before).toBe(0);
    expect(visits?.percent).toBeUndefined();
  });
});

describe('rendering the comparison', () => {
  it('names both periods', () => {
    const lines = renderComparison(report());
    expect(lines[0]).toBe('season comparison  2025-01-13 to 2025-01-15');
    expect(lines[1]).toBe('against 2025-01-06 to 2025-01-08, 3 days each');
  });

  it('says so rather than printing an infinite improvement', () => {
    expect(
      renderComparison(report()).some((line) => line.includes('against nothing last time')),
    ).toBe(true);
  });

  it('says up or down when there is something to compare', () => {
    expect(renderComparison(overlapping()).some((line) => line.includes('up 0%'))).toBe(true);
  });
});

describe('what is worth an email', () => {
  it('finds nothing when nothing moved', () => {
    expect(notableChanges(overlapping())).toEqual([]);
  });

  it('skips the changes that cannot be measured', () => {
    expect(notableChanges(report())).toEqual([]);
  });
});
