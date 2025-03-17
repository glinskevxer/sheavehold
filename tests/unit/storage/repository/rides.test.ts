import { describe, expect, it } from 'vitest';
import { RideStore } from '../../../../src/storage/repository/rides.js';
import { buildVisits } from '../../../../src/domain/visit/visit.js';
import { parseLiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { CARD_TESS } from '../../../support/media.js';
import { ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

const lift = (raw: string) => expectOk(parseLiftCode(raw), 'lift');

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

function loaded(): RideStore {
  const store = new RideStore();
  const thirteenth = [
    ...ridesFrom([at(0, { terminal: 'SUNB.01' }), at(40, { terminal: 'RIDGE.01' })]),
    ...ridesFrom([at(20, { terminal: 'MEADW.01', media: CARD_TESS })]),
  ];
  const fourteenth = ridesFrom([{ at: '2025-01-14T17:00:00Z', terminal: 'SUNB.01' }]);
  store.replaceDate(day('2025-01-13'), thirteenth, buildVisits(thirteenth));
  store.replaceDate(day('2025-01-14'), fourteenth, buildVisits(fourteenth));
  return store;
}

describe('holding a day of rides', () => {
  it('counts what it holds', () => {
    expect(loaded().counts()).toEqual({ rides: 4, visits: 3 });
  });

  it('slices a day in time order', () => {
    const store = loaded();
    const rides = store.ridesOn(day('2025-01-13'));
    expect(rides).toHaveLength(3);
    expect(rides.map((ride) => ride.lift)).toEqual(['SUNB', 'MEADW', 'RIDGE']);
    expect(store.ridesOn(day('2025-02-01'))).toEqual([]);
  });

  it('follows one guest over the season and over one day', () => {
    const store = loaded();
    expect(store.ridesOfGuest('G-77')).toHaveLength(3);
    expect(store.ridesOfGuestOn('G-77', day('2025-01-13'))).toHaveLength(2);
    expect(store.ridesOfGuest('G-000')).toEqual([]);
  });

  it('follows one lift on one day', () => {
    const store = loaded();
    expect(store.ridesOnLift(lift('SUNB'), day('2025-01-13'))).toHaveLength(1);
    expect(store.ridesOnLift(lift('BOWL'), day('2025-01-13'))).toEqual([]);
  });

  it('follows one entitlement', () => {
    expect(loaded().ridesOfEntitlement('ENT-1002')).toHaveLength(1);
  });

  it('lists the dates and the lifts that turned', () => {
    const store = loaded();
    expect(store.dates()).toEqual(['2025-01-13', '2025-01-14']);
    expect(store.liftsThatTurned(day('2025-01-13'))).toEqual(['MEADW', 'RIDGE', 'SUNB']);
  });

  it('adds the day vertical and counts the skier visits', () => {
    const store = loaded();
    expect(store.verticalOn(day('2025-01-13'))).toBe(1240 + 1880 + 380);
    expect(store.skierVisitsOn(day('2025-01-13'))).toBe(2);
    expect(store.skierVisitsOn(day('2025-02-01'))).toBe(0);
    expect(store.verticalOn(day('2025-02-01'))).toBe(0);
  });
});

describe('holding visits', () => {
  it('slices a day, a guest and an entitlement', () => {
    const store = loaded();
    expect(store.visitsOn(day('2025-01-13'))).toHaveLength(2);
    expect(store.visitsOfGuest('G-77')).toHaveLength(2);
    expect(store.visitsOfEntitlement('ENT-1002')).toHaveLength(1);
  });

  it('lists the days an entitlement was used on', () => {
    const store = loaded();
    expect(store.daysUsedBy('ENT-1001')).toEqual(['2025-01-13', '2025-01-14']);
    expect(store.daysUsedBy('ENT-NOPE')).toEqual([]);
  });
});

describe('recomputing a day', () => {
  it('swaps the whole day out rather than adding to it', () => {
    const store = loaded();
    const replacement = ridesFrom([at(0, { terminal: 'BOWL.01' })]);
    store.replaceDate(day('2025-01-13'), replacement, buildVisits(replacement));
    expect(store.ridesOn(day('2025-01-13'))).toHaveLength(1);
    expect(store.visitsOn(day('2025-01-13'))).toHaveLength(1);
    expect(store.counts()).toEqual({ rides: 2, visits: 2 });
  });

  it('leaves every other day alone', () => {
    const store = loaded();
    store.replaceDate(day('2025-01-13'), [], []);
    expect(store.ridesOn(day('2025-01-14'))).toHaveLength(1);
    expect(store.ridesOn(day('2025-01-13'))).toEqual([]);
  });

  it('takes the guest index down with the rides', () => {
    const store = loaded();
    store.replaceDate(day('2025-01-13'), [], []);
    expect(store.ridesOfGuest('G-78')).toEqual([]);
    expect(store.ridesOfGuest('G-77')).toHaveLength(1);
  });
});
