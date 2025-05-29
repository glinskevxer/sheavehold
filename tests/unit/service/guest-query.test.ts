import { describe, expect, it } from 'vitest';
import {
  daysSinceLastVisit,
  guestHistory,
  householdHistory,
  type GuestQueryContext,
} from '../../../src/service/guest-query.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { entitlement } from '../../support/entitlements.js';
import { CARD_TESS } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(): GuestQueryContext {
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
  return { reference: system.reference, rides: system.rides, asOf: day('2025-01-15') };
}

describe('one guest at the window', () => {
  it('names them and puts them in an age band', () => {
    const history = guestHistory('G-77', loaded());
    expect(history?.name).toBe('Ardley, Row');
    expect(history?.ageBand).toBe('adult');
    expect(history?.householdId).toBe('HH-1');
  });

  it('adds their season up', () => {
    const history = guestHistory('G-77', loaded());
    expect(history?.totalRides).toBe(3);
    expect(history?.daysSkied).toBe(2);
    expect(history?.totalVerticalFt).toBe(3720);
    expect(history?.favouriteLift).toBe('SUNB');
  });

  it('gives the first and last day they were out', () => {
    const history = guestHistory('G-77', loaded());
    expect(history?.firstSeen).toBe('2025-01-13');
    expect(history?.lastSeen).toBe('2025-01-15');
  });

  it('lists what they are carrying', () => {
    const line = guestHistory('G-77', loaded())?.entitlements[0];
    expect(line).toMatchObject({
      entitlementId: 'ENT-1001',
      productCode: 'SEAS',
      productName: 'Season Pass',
      unlimited: true,
      daysLeft: 0,
      voided: false,
    });
    expect(line?.daysUsed).toEqual(['2025-01-13', '2025-01-15']);
  });

  it('counts down a ticket rather than calling it unlimited', () => {
    const line = guestHistory('G-78', loaded())?.entitlements[0];
    expect(line).toMatchObject({ productCode: 'A3DAY', unlimited: false, daysLeft: 1 });
    expect(line?.daysUsed).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('marks a voided pass', () => {
    const context = loaded();
    context.reference.entitlements.upsert(
      entitlement('ENT-1001', 'SEAS', 'G-77', { voidedAt: new Date('2025-01-20T17:00:00Z') }),
    );
    expect(guestHistory('G-77', context)?.entitlements[0]?.voided).toBe(true);
  });

  it('says so when the product has gone from the catalogue', () => {
    const context = loaded();
    context.reference.products.delete('SEAS');
    const line = guestHistory('G-77', context)?.entitlements[0];
    expect(line?.productName).toBe('unknown product');
    expect(line?.daysLeft).toBe(0);
  });

  it('answers nothing for somebody who is not on file', () => {
    expect(guestHistory('G-000', loaded())).toBeUndefined();
  });

  it('gives a guest who has never skied zeroes rather than nothing', () => {
    const history = guestHistory('G-93', loaded());
    expect(history).toMatchObject({ totalRides: 0, daysSkied: 0, totalVerticalFt: 0 });
    expect(history?.favouriteLift).toBeUndefined();
    expect(history?.firstSeen).toBeUndefined();
  });
});

describe('a household', () => {
  it('lists everybody on the account, biggest skier first', () => {
    const rows = householdHistory('HH-1', loaded());
    expect(rows.map((row) => row.guest.id)).toEqual(['G-77', 'G-78', 'G-79']);
    expect(rows[0]?.totalVerticalFt).toBeGreaterThan(rows[1]!.totalVerticalFt);
  });

  it('gives nothing for a household nobody is on', () => {
    expect(householdHistory('HH-9', loaded())).toEqual([]);
  });
});

describe('how long since they were here', () => {
  it('counts the days from the last visit', () => {
    const history = guestHistory('G-77', loaded())!;
    expect(daysSinceLastVisit(history, day('2025-01-20'))).toBe(5);
    expect(daysSinceLastVisit(history, day('2025-01-15'))).toBe(0);
  });

  it('answers nothing for somebody who has never been', () => {
    const history = guestHistory('G-93', loaded())!;
    expect(daysSinceLastVisit(history, day('2025-01-20'))).toBeUndefined();
  });
});
