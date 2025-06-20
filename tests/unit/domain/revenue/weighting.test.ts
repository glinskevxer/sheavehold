import { describe, expect, it } from 'vitest';
import { attributeEntitlement } from '../../../../src/domain/revenue/attribution.js';
import {
  byDayClass,
  byRides,
  bySpan,
  byVertical,
  combine,
  DEFAULT_CLASS_WEIGHTS,
  describeWeights,
  excluding,
  frontLoaded,
  scaled,
} from '../../../../src/domain/revenue/weighting.js';
import { buildVisits, type Visit } from '../../../../src/domain/visit/visit.js';
import { sumMoney } from '../../../../src/util/money.js';
import { calendar2024, day } from '../../../support/season.js';
import { ENTITLEMENTS } from '../../../support/entitlements.js';
import { ADULT_THREE } from '../../../support/products.js';
import { CARD_TESS } from '../../../support/media.js';
import { ridesFrom } from '../../../support/pipeline.js';

function visitsOn(dates: readonly string[], ridesPerDay = 1): Visit[] {
  const rides = dates.flatMap((date, i) =>
    Array.from({ length: ridesPerDay }, (_, r) =>
      ridesFrom([
        {
          at: `${date}T${String(17 + r).padStart(2, '0')}:00:00Z`,
          seq: i * 10 + r + 1,
          media: CARD_TESS,
          terminal: 'MEADW.01',
        },
      ]),
    ).flat(),
  );
  return buildVisits(rides);
}

describe('the simple rules', () => {
  const visits = visitsOn(['2025-01-13', '2025-01-14'], 2);

  it('weights by rides and never gives a day nothing', () => {
    expect(visits.map(byRides)).toEqual([2, 2]);
    expect(byRides({ ...visits[0]!, rideCount: 0 })).toBe(1);
  });

  it('weights by vertical in hundreds of feet', () => {
    expect(visits.map(byVertical)).toEqual([8, 8]);
    expect(byVertical({ ...visits[0]!, verticalFt: 0 })).toBe(1);
  });

  it('weights by time on the hill', () => {
    expect(visits.map(bySpan)).toEqual([60, 60]);
    expect(bySpan({ ...visits[0]!, spanMinutes: 0 })).toBe(1);
  });
});

describe('the rate card', () => {
  const classOf = (date: ReturnType<typeof day>) => calendar2024().plan(date).dayClass;

  it('gives a weekend more than a midweek day', () => {
    const rule = byDayClass(classOf);
    expect(rule(visitsOn(['2025-01-13'])[0]!)).toBe(100);
    expect(rule(visitsOn(['2025-01-11'])[0]!)).toBe(165);
    expect(DEFAULT_CLASS_WEIGHTS.peak).toBe(200);
  });

  it('takes a different card when the area changes its prices', () => {
    const rule = byDayClass(classOf, { midweek: 1, weekend: 2, holiday: 3, peak: 4 });
    expect(rule(visitsOn(['2025-01-13'])[0]!)).toBe(1);
  });
});

describe('front loading a trip', () => {
  it('gives the first day the most and decays after it', () => {
    const dates = [day('2025-01-13'), day('2025-01-14'), day('2025-01-15')];
    const rule = frontLoaded(dates);
    expect(visitsOn(['2025-01-13', '2025-01-14', '2025-01-15']).map(rule)).toEqual([100, 85, 72]);
  });

  it('takes a gentler decay', () => {
    const rule = frontLoaded([day('2025-01-13'), day('2025-01-14')], 1);
    expect(visitsOn(['2025-01-13', '2025-01-14']).map(rule)).toEqual([100, 100]);
  });

  it('treats a day it has never heard of as the first', () => {
    const rule = frontLoaded([day('2025-01-13')]);
    expect(rule(visitsOn(['2025-02-01'])[0]!)).toBe(100);
  });
});

describe('combining rules', () => {
  const visits = visitsOn(['2025-01-13', '2025-01-14'], 2);

  it('multiplies two rules together', () => {
    expect(visits.map(combine(byRides, byVertical))).toEqual([16, 16]);
  });

  it('scales a rule', () => {
    expect(visits.map(scaled(byRides, 2.5))).toEqual([5, 5]);
    expect(visits.map(scaled(byRides, -1))).toEqual([0, 0]);
  });

  it('takes a day out of the split entirely', () => {
    const rule = excluding(byRides, [day('2025-01-13')]);
    expect(visits.map(rule)).toEqual([0, 2]);
  });

  it('still splits the money exactly with an excluded day', () => {
    const rule = excluding(byRides, [day('2025-01-13')]);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits, { weight: rule });
    expect(lines.map((line) => line.value)).toEqual([0, 34500]);
    expect(sumMoney(lines.map((line) => line.value))).toBe(34500);
  });

  it('gives every day nothing when every weight is nothing', () => {
    const rule = excluding(byRides, [day('2025-01-13'), day('2025-01-14')]);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits, { weight: rule });
    expect(lines.map((line) => line.value)).toEqual([0, 0]);
  });

  it('describes what a rule did, for the report footnote', () => {
    expect(describeWeights(byRides, visits)).toEqual(['2025-01-13 2', '2025-01-14 2']);
  });
});
