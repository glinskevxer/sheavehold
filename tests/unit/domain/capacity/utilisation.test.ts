import { describe, expect, it } from 'vitest';
import {
  areaUtilisation,
  hoursCovered,
  liftUtilisation,
  pinchedHours,
  verticalCapacityDelivered,
} from '../../../../src/domain/capacity/utilisation.js';
import { defaultPlan } from '../../../../src/domain/calendar/season.js';
import { MEADOW, SUNBURST } from '../../../support/lifts.js';
import { CARD_TESS } from '../../../support/media.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

const sample = () =>
  ridesFrom([at(0), at(20), at(40), at(70), at(10, { media: CARD_TESS, terminal: 'MEADW.01' })]);

describe('one lift', () => {
  it('counts only the hours it turned in the denominator', () => {
    const row = liftUtilisation(SUNBURST, sample());
    expect(row.hoursTurning).toBe(2);
    expect(row.ridesCarried).toBe(4);
    expect(row.designCapacity).toBe(2400 * 2);
  });

  it('gives a percentage nobody has to work out', () => {
    const row = liftUtilisation(SUNBURST, sample());
    expect(row.utilisationPercent).toBe(0.1);
  });

  it('reports the peak hour against one hour of design', () => {
    const row = liftUtilisation(SUNBURST, sample());
    expect(row.peakHourRides).toBe(3);
    expect(row.peakHourPercent).toBe(0.1);
  });

  it('gives a lift that never turned zeroes rather than a divide by nothing', () => {
    const row = liftUtilisation(MEADOW, ridesFrom([at(0)]));
    expect(row).toMatchObject({
      hoursTurning: 0,
      ridesCarried: 0,
      designCapacity: 0,
      utilisationPercent: 0,
      peakHourPercent: 0,
    });
  });

  it('carries the vertical and the name', () => {
    const row = liftUtilisation(SUNBURST, sample());
    expect(row.name).toBe('Sunburst');
    expect(row.verticalFt).toBe(4 * 1240);
  });
});

describe('the whole area', () => {
  it('leaves the lifts that did not turn out of both sides', () => {
    const area = areaUtilisation(
      day('2025-01-13'),
      sample(),
      lifts(),
      defaultPlan(day('2025-01-13')),
    );
    expect(area.liftsTurning).toBe(2);
    expect(area.lifts.map((row) => row.lift)).toEqual(['SUNB', 'MEADW']);
    expect(area.designCapacity).toBe(2400 * 2 + 1000 * 1);
  });

  it('reports what the area could have done all day separately', () => {
    const area = areaUtilisation(
      day('2025-01-13'),
      sample(),
      lifts(),
      defaultPlan(day('2025-01-13')),
    );
    expect(area.scheduledMinutes).toBe(420);
    expect(area.theoreticalCapacity).toBeGreaterThan(area.designCapacity);
  });

  it('gives a closed day a theoretical capacity of nothing', () => {
    const plan = { ...defaultPlan(day('2025-01-11')), status: 'closed' as const };
    const area = areaUtilisation(day('2025-01-11'), [], lifts(), plan);
    expect(area.theoreticalCapacity).toBe(0);
    expect(area.utilisationPercent).toBe(0);
    expect(area.lifts).toEqual([]);
  });
});

describe('vertical against what the lifts could have lifted', () => {
  it('compares the two and gives a share', () => {
    const result = verticalCapacityDelivered(sample(), lifts());
    expect(result.delivered).toBe(4 * 1240 + 380);
    expect(result.design).toBeGreaterThan(result.delivered);
    expect(result.percent).toBeGreaterThan(0);
  });

  it('gives nothing rather than dividing by nothing', () => {
    expect(verticalCapacityDelivered([], lifts())).toEqual({
      delivered: 0,
      design: 0,
      percent: 0,
    });
  });
});

describe('hours where a lift was pinched', () => {
  it('finds nothing on an ordinary day', () => {
    expect(pinchedHours(SUNBURST, sample())).toEqual([]);
  });

  it('finds an hour once the threshold is low enough to bite', () => {
    const found = pinchedHours(SUNBURST, sample(), 0.1);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ hour: 5, rides: 3 });
  });

  it('lists the hours the day covered', () => {
    expect(hoursCovered(sample())).toEqual([5, 6]);
    expect(hoursCovered([])).toEqual([]);
  });
});
