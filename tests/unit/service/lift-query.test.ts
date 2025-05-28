import { describe, expect, it } from 'vitest';
import { liftDay, liftPeriod, liftsThatDidNotTurn } from '../../../src/service/lift-query.js';
import type { QueryContext } from '../../../src/service/query.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { CARD_IDA, CARD_TESS } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(): QueryContext {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T17:20:00Z', seq: 2, terminal: 'SUNB.01' },
    { at: '2025-01-13T19:40:00Z', seq: 3, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:40:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_IDA },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  system.ingest([{ at: '2025-01-15T17:00:00Z', seq: 3, terminal: 'MEADW.01', media: CARD_IDA }], {
    batch: 'up-3',
    terminal: 'MEADW.01',
  });
  recomputeDates([day('2025-01-13'), day('2025-01-15')], system);
  return {
    rides: system.rides,
    scans: system.scans,
    calendar: system.calendar,
    lifts: system.lifts,
  };
}

describe('the lift sheet for a day', () => {
  it('gives a row for every lift that could have run', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows.map((row) => row.lift)).toEqual(['SUNB', 'MEADW', 'BOWL', 'CRPT', 'POMA', 'RIDGE']);
  });

  it('counts rides and the people behind them separately', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows[0]).toMatchObject({ lift: 'SUNB', rides: 3, riders: 1, turned: true });
    expect(rows[1]).toMatchObject({ lift: 'MEADW', rides: 2, riders: 2 });
  });

  it('carries the rise and the vertical', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows[0]?.riseFt).toBe(1240);
    expect(rows[0]?.verticalFt).toBe(3720);
  });

  it('gives the first and last boarding on that lift', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows[0]?.firstRideAt?.toISOString()).toBe('2025-01-13T17:00:08.000Z');
    expect(rows[0]?.lastRideAt?.toISOString()).toBe('2025-01-13T19:40:08.000Z');
  });

  it('names the busiest hour on the lift', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows[0]?.busiestHourStart?.toISOString()).toBe('2025-01-13T17:00:00.000Z');
    expect(rows[0]?.busiestHourRides).toBe(2);
  });

  it('gives a share of the day rides', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    expect(rows[0]?.shareOfRides).toBe(60);
    expect(rows[1]?.shareOfRides).toBe(40);
  });

  it('marks a lift that never turned rather than leaving it out', () => {
    const rows = liftDay(day('2025-01-13'), loaded());
    const bowl = rows.find((row) => row.lift === 'BOWL');
    expect(bowl).toMatchObject({ turned: false, rides: 0, riders: 0, shareOfRides: 0 });
    expect(bowl?.busiestHourStart).toBeUndefined();
  });

  it('lists the lifts that did not turn', () => {
    expect(liftsThatDidNotTurn(day('2025-01-13'), loaded()).map((row) => row.lift)).toEqual([
      'BOWL',
      'CRPT',
      'POMA',
      'RIDGE',
    ]);
  });

  it('leaves the retired double off the sheet', () => {
    expect(liftDay(day('2025-01-13'), loaded()).some((row) => row.lift === 'OLDDB')).toBe(false);
  });

  it('gives every lift a zero row on a day nobody skied', () => {
    const rows = liftDay(day('2025-01-14'), loaded());
    expect(rows.every((row) => row.rides === 0 && row.shareOfRides === 0)).toBe(true);
  });
});

describe('the lift sheet over a period', () => {
  it('counts the days each lift turned', () => {
    const rows = liftPeriod(day('2025-01-13'), day('2025-01-15'), loaded());
    expect(rows.find((row) => row.lift === 'SUNB')).toMatchObject({ daysTurning: 1, rides: 3 });
    expect(rows.find((row) => row.lift === 'MEADW')).toMatchObject({ daysTurning: 2, rides: 3 });
  });

  it('names the best day for each lift', () => {
    const rows = liftPeriod(day('2025-01-13'), day('2025-01-15'), loaded());
    const meadow = rows.find((row) => row.lift === 'MEADW');
    expect(meadow?.bestDate).toBe('2025-01-13');
    expect(meadow?.bestDateRides).toBe(2);
  });

  it('leaves a lift that never turned with nothing rather than undefined counts', () => {
    const rows = liftPeriod(day('2025-01-13'), day('2025-01-15'), loaded());
    const bowl = rows.find((row) => row.lift === 'BOWL');
    expect(bowl).toMatchObject({ daysTurning: 0, rides: 0, verticalFt: 0 });
    expect(bowl?.bestDate).toBeUndefined();
  });

  it('gives nothing for a reversed period', () => {
    const rows = liftPeriod(day('2025-01-15'), day('2025-01-13'), loaded());
    expect(rows.every((row) => row.rides === 0)).toBe(true);
  });
});
