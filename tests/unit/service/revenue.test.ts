import { describe, expect, it } from 'vitest';
import {
  attributeSeason,
  dayRevenue,
  passValue,
  productRevenue,
  seasonTotal,
  type RevenueContext,
} from '../../../src/service/revenue.js';
import { byRides } from '../../../src/domain/revenue/weighting.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { CARD_TESS } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(): RevenueContext {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'SUNB.01' },
    { at: '2025-01-15T17:00:00Z', seq: 3, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-14T17:30:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
  return { reference: system.reference, rides: system.rides };
}

describe('attributing the season', () => {
  it('spreads every used entitlement and keeps the rest aside', () => {
    const result = attributeSeason(loaded());
    expect(result.lines.map((line) => line.entitlementId).sort()).toEqual([
      'ENT-1001',
      'ENT-1001',
      'ENT-1002',
      'ENT-1002',
    ]);
    expect(result.unusedEntitlements).toEqual(['ENT-1003', 'ENT-2001']);
  });

  it('adds to the price paid on every used pass', () => {
    expect(seasonTotal(loaded())).toBe(89_900 + 34_500);
  });

  it('takes a weighting rule through', () => {
    const total = seasonTotal(loaded(), { weight: byRides });
    expect(total).toBe(89_900 + 34_500);
  });
});

describe('what a day was worth', () => {
  it('gives one row per day inclusive', () => {
    const rows = dayRevenue(day('2025-01-13'), day('2025-01-15'), loaded());
    expect(rows.map((row) => row.date)).toEqual(['2025-01-13', '2025-01-14', '2025-01-15']);
  });

  it('splits the season pass over the two days it was used', () => {
    const rows = dayRevenue(day('2025-01-13'), day('2025-01-15'), loaded());
    expect(rows[0]?.value).toBe(44_950 + 17_250);
    expect(rows[2]?.value).toBe(44_950);
  });

  it('gives a per visit figure and a printed one', () => {
    const rows = dayRevenue(day('2025-01-13'), day('2025-01-15'), loaded());
    expect(rows[0]?.visits).toBe(2);
    expect(rows[0]?.perVisit).toBe(Math.round((44_950 + 17_250) / 2));
    expect(rows[2]?.formatted).toBe('$449.50');
  });

  it('gives a day nobody skied zero rather than nothing', () => {
    const rows = dayRevenue(day('2025-01-20'), day('2025-01-20'), loaded());
    expect(rows[0]).toMatchObject({ value: 0, visits: 0, perVisit: 0 });
  });
});

describe('what each product was worth', () => {
  it('ranks the products by value', () => {
    const rows = productRevenue(loaded());
    expect(rows.map((row) => row.productCode)).toEqual(['SEAS', 'A3DAY']);
    expect(rows[0]?.productName).toBe('Season Pass');
    expect(rows[0]?.value).toBe(89_900);
  });

  it('counts the entitlements and the visits behind each row', () => {
    const rows = productRevenue(loaded());
    expect(rows[0]).toMatchObject({ entitlements: 1, visits: 2 });
    expect(rows[0]?.perVisit).toBe(44_950);
  });

  it('leaves a product nobody used off the list', () => {
    expect(productRevenue(loaded()).some((row) => row.productCode === 'BEG')).toBe(false);
  });
});

describe('what a season pass cost its holder', () => {
  it('divides the price by the days they skied', () => {
    const lines = passValue(loaded());
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      entitlementId: 'ENT-1001',
      daysSkied: 2,
      costPerDay: 44_950,
      beatWalkUp: false,
    });
  });

  it('leaves the counted tickets out entirely', () => {
    expect(passValue(loaded()).some((line) => line.productCode === 'A3DAY')).toBe(false);
  });

  it('gives a pass nobody used a cost of nothing rather than infinity', () => {
    const lines = passValue(loaded());
    const unused = lines.find((line) => line.entitlementId === 'ENT-2001');
    expect(unused).toMatchObject({ daysSkied: 0, costPerDay: 0, beatWalkUp: false });
  });

  it('says a pass beat the window once it has been used enough', () => {
    const context = loaded();
    for (let d = 16; d <= 28; d += 1) {
      const date = `2025-01-${String(d).padStart(2, '0')}`;
      context.rides.visits.upsert({
        id: `V-${date}-G-77-ENT-1001`,
        guestId: 'G-77',
        entitlementId: 'ENT-1001',
        productCode: 'SEAS',
        operatingDate: date as never,
        firstRideAt: new Date(`${date}T17:00:00Z`),
        lastRideAt: new Date(`${date}T17:00:00Z`),
        rideCount: 1,
        verticalFt: 1240,
        lifts: [],
        sessions: [],
        spanMinutes: 0,
      });
    }
    const line = passValue(context).find((entry) => entry.entitlementId === 'ENT-1001');
    expect(line?.daysSkied).toBe(15);
    expect(line?.beatWalkUp).toBe(true);
  });
});
