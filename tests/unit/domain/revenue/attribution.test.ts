import { describe, expect, it } from 'vitest';
import {
  attributeAll,
  attributeEntitlement,
  costPerVisit,
  evenWeight,
  valueByDate,
  valueByProduct,
  valueOnDate,
} from '../../../../src/domain/revenue/attribution.js';
import { buildVisits } from '../../../../src/domain/visit/visit.js';
import { sumMoney } from '../../../../src/util/money.js';
import { catalogue, ENTITLEMENTS, entitlement } from '../../../support/entitlements.js';
import { ADULT_THREE, SEASON_UNRESTRICTED } from '../../../support/products.js';
import { CARD_TESS } from '../../../support/media.js';
import { ridesFrom } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

function visitsOverDays(dates: readonly string[], media = CARD_TESS, terminal = 'MEADW.01') {
  return buildVisits(
    dates.flatMap((date, i) =>
      ridesFrom([{ at: `${date}T17:00:00Z`, seq: i + 1, media, terminal }]),
    ),
  );
}

describe('spreading one sale over the days it was used', () => {
  it('splits a three day ticket into three equal days', () => {
    const visits = visitsOverDays(['2025-01-13', '2025-01-14', '2025-01-15']);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.value)).toEqual([11500, 11500, 11500]);
    expect(sumMoney(lines.map((line) => line.value))).toBe(34500);
  });

  it('puts the whole price on one day when only one was used', () => {
    const visits = visitsOverDays(['2025-01-13']);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.value).toBe(34500);
  });

  it('never loses a cent to rounding', () => {
    const sale = entitlement('ENT-1002', 'A3DAY', 'G-78', { pricePaidCents: 10_000 });
    const visits = visitsOverDays(['2025-01-13', '2025-01-14', '2025-01-15']);
    const lines = attributeEntitlement(sale, ADULT_THREE, visits);
    expect(sumMoney(lines.map((line) => line.value))).toBe(10_000);
    expect(lines.map((line) => line.value)).toEqual([3334, 3333, 3333]);
  });

  it('gives nothing back when the pass was never used', () => {
    expect(attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, [])).toEqual([]);
  });

  it('weights the days when the caller says to', () => {
    const visits = visitsOverDays(['2025-01-13', '2025-01-14']);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits, {
      weight: (visit) => (visit.operatingDate === '2025-01-13' ? 3 : 1),
    });
    expect(lines.map((line) => line.value)).toEqual([25875, 8625]);
    expect(evenWeight(visits[0]!)).toBe(1);
  });

  it('treats a negative weight as nothing', () => {
    const visits = visitsOverDays(['2025-01-13', '2025-01-14']);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits, {
      weight: (visit) => (visit.operatingDate === '2025-01-13' ? -5 : 1),
    });
    expect(lines[0]?.value).toBe(0);
    expect(lines[1]?.value).toBe(34500);
  });

  it('sorts the lines by date', () => {
    const visits = visitsOverDays(['2025-01-15', '2025-01-13']);
    const lines = attributeEntitlement(ENTITLEMENTS[1]!, ADULT_THREE, visits);
    expect(lines.map((line) => line.date)).toEqual(['2025-01-13', '2025-01-15']);
  });
});

describe('spreading the whole season', () => {
  function attributed() {
    const visits = [
      ...visitsOverDays(['2025-01-13', '2025-01-14']),
      ...buildVisits(ridesFrom([{ at: '2025-01-13T17:00:00Z', seq: 9, terminal: 'SUNB.01' }])),
    ];
    return attributeAll({ entitlements: ENTITLEMENTS, products: catalogue(), visits });
  }

  it('spreads every entitlement that was used', () => {
    const result = attributed();
    expect(result.lines.map((line) => line.entitlementId).sort()).toEqual([
      'ENT-1001',
      'ENT-1002',
      'ENT-1002',
    ]);
  });

  it('keeps the money on unused passes out of the days', () => {
    const result = attributed();
    expect(result.unusedEntitlements).toEqual(['ENT-1003', 'ENT-2001']);
    expect(result.unusedValue).toBe(5_900 + 44_900);
  });

  it('adds a day up', () => {
    const result = attributed();
    expect(valueOnDate(result, day('2025-01-13'))).toBe(89_900 + 17_250);
    expect(valueOnDate(result, day('2025-01-20'))).toBe(0);
  });

  it('groups by date and by product', () => {
    const result = attributed();
    expect([...valueByDate(result).keys()]).toEqual(['2025-01-13', '2025-01-14']);
    expect(valueByProduct(result).get('A3DAY')).toBe(34_500);
    expect(valueByProduct(result).get('SEAS')).toBe(89_900);
  });

  it('skips an entitlement whose product has gone', () => {
    const result = attributeAll({
      entitlements: ENTITLEMENTS,
      products: { find: () => undefined },
      visits: visitsOverDays(['2025-01-13']),
    });
    expect(result.lines).toEqual([]);
    expect(result.unusedValue).toBe(0);
  });
});

describe('what a pass cost per day out', () => {
  it('divides the price by the visits', () => {
    expect(costPerVisit(ENTITLEMENTS[0]!, SEASON_UNRESTRICTED, 20)).toBe(4_495);
    expect(costPerVisit(ENTITLEMENTS[1]!, ADULT_THREE, 3)).toBe(11_500);
  });

  it('answers nothing rather than dividing by nothing', () => {
    expect(costPerVisit(ENTITLEMENTS[0]!, SEASON_UNRESTRICTED, 0)).toBe(0);
  });

  it('refuses to answer for a counted pass used more days than it had', () => {
    expect(costPerVisit(ENTITLEMENTS[1]!, ADULT_THREE, 5)).toBe(0);
  });
});
