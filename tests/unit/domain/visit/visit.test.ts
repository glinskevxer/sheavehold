import { describe, expect, it } from 'vitest';
import {
  averageRidesPerVisit,
  buildVisits,
  DEFAULT_SESSION_GAP_MINUTES,
  daysSkied,
  singleRideVisits,
  skierVisits,
  visitId,
  visitsOfEntitlement,
  visitsOfGuest,
  visitsOn,
} from '../../../../src/domain/visit/visit.js';
import { CARD_IDA, CARD_TESS } from '../../../support/media.js';
import { ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

function at(minutesFromNine: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutesFromNine * 60_000).toISOString(), ...overrides };
}

describe('building visits', () => {
  it('makes one visit from a day of rides', () => {
    const visits = buildVisits(ridesFrom([at(0), at(20), at(40)]));
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      guestId: 'G-77',
      entitlementId: 'ENT-1001',
      productCode: 'SEAS',
      operatingDate: '2025-01-13',
      rideCount: 3,
      spanMinutes: 40,
    });
    expect(visits[0]?.verticalFt).toBe(3 * 1240);
  });

  it('gives a stable readable id', () => {
    const visits = buildVisits(ridesFrom([at(0)]));
    expect(visits[0]?.id).toBe('V-2025-01-13-G-77-ENT-1001');
    expect(visitId(day('2025-01-14'), 'G-1', 'E-1')).toBe('V-2025-01-14-G-1-E-1');
  });

  it('lists the lifts once each, sorted', () => {
    const visits = buildVisits(
      ridesFrom([
        at(0, { terminal: 'SUNB.01' }),
        at(30, { terminal: 'RIDGE.01' }),
        at(60, { terminal: 'SUNB.01' }),
      ]),
    );
    expect(visits[0]?.lifts).toEqual(['RIDGE', 'SUNB']);
  });

  it('splits two days into two visits', () => {
    const visits = buildVisits(
      ridesFrom([{ at: '2025-01-13T17:00:00Z' }, { at: '2025-01-14T17:00:00Z' }]),
    );
    expect(visits).toHaveLength(2);
    expect(visits.map((visit) => visit.operatingDate)).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('splits two entitlements on one day into two visits', () => {
    const visits = buildVisits([
      ...ridesFrom([at(0)]),
      ...ridesFrom([at(30, { media: CARD_TESS, terminal: 'MEADW.01' })]),
    ]);
    expect(visits).toHaveLength(2);
    expect(visits.map((visit) => visit.entitlementId)).toEqual(['ENT-1001', 'ENT-1002']);
  });

  it('gives nothing back for no rides', () => {
    expect(buildVisits([])).toEqual([]);
  });
});

describe('sessions inside a visit', () => {
  it('keeps a steady morning as one session', () => {
    const visits = buildVisits(ridesFrom([at(0), at(20), at(40), at(60)]));
    expect(visits[0]?.sessions).toHaveLength(1);
    expect(visits[0]?.sessions[0]?.rideCount).toBe(4);
  });

  it('splits on a long gap', () => {
    const visits = buildVisits(ridesFrom([at(0), at(20), at(300), at(320)]));
    const sessions = visits[0]?.sessions ?? [];
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.rideCount).toBe(2);
    expect(sessions[1]?.rideCount).toBe(2);
  });

  it('does not split exactly on the gap', () => {
    const visits = buildVisits(ridesFrom([at(0), at(DEFAULT_SESSION_GAP_MINUTES)]));
    expect(visits[0]?.sessions).toHaveLength(1);
  });

  it('takes a narrower gap when asked', () => {
    const visits = buildVisits(ridesFrom([at(0), at(40)]), { sessionGapMinutes: 30 });
    expect(visits[0]?.sessions).toHaveLength(2);
  });

  it('carries the vertical and the lifts onto each session', () => {
    const visits = buildVisits(
      ridesFrom([at(0, { terminal: 'SUNB.01' }), at(300, { terminal: 'RIDGE.01' })]),
    );
    const sessions = visits[0]?.sessions ?? [];
    expect(sessions[0]?.lifts).toEqual(['SUNB']);
    expect(sessions[1]?.verticalFt).toBe(1880);
    expect(sessions[0]?.endedAt.getTime()).toBeGreaterThan(sessions[0]!.startedAt.getTime());
  });
});

describe('counting visits', () => {
  const visits = () =>
    buildVisits([
      ...ridesFrom([at(0), at(20)]),
      ...ridesFrom([at(10, { media: CARD_TESS, terminal: 'MEADW.01' })]),
      ...ridesFrom([at(15, { media: CARD_IDA, terminal: 'MEADW.01' })]),
      ...ridesFrom([{ at: '2025-01-14T17:00:00Z' }]),
    ]);

  it('slices one day', () => {
    expect(visitsOn(visits(), day('2025-01-13'))).toHaveLength(3);
    expect(visitsOn(visits(), day('2025-02-01'))).toEqual([]);
  });

  it('counts a person once a day however many passes they carried', () => {
    expect(skierVisits(visits(), day('2025-01-13'))).toBe(3);
    expect(skierVisits(visits(), day('2025-01-14'))).toBe(1);
    expect(skierVisits(visits(), day('2025-02-01'))).toBe(0);
  });

  it('follows one guest and one entitlement', () => {
    expect(visitsOfGuest(visits(), 'G-77')).toHaveLength(2);
    expect(visitsOfEntitlement(visits(), 'ENT-1002')).toHaveLength(1);
    expect(daysSkied(visits(), 'G-77')).toEqual(['2025-01-13', '2025-01-14']);
    expect(daysSkied(visits(), 'G-000')).toEqual([]);
  });

  it('finds the visits that took one ride', () => {
    expect(singleRideVisits(visits())).toHaveLength(3);
  });

  it('averages the rides per visit', () => {
    expect(averageRidesPerVisit(visits())).toBe(1.3);
    expect(averageRidesPerVisit([])).toBe(0);
  });
});
