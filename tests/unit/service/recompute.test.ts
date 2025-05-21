import { describe, expect, it } from 'vitest';
import { recomputeDate, recomputeDates, seedLedger } from '../../../src/service/recompute.js';
import { CARD_MILO, CARD_TESS } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

describe('rebuilding a day', () => {
  it('turns the stored scans into rides and visits', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T18:00:00Z', seq: 2 },
    ]);
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.scansConsidered).toBe(2);
    expect(result.rides).toHaveLength(2);
    expect(result.visits).toHaveLength(1);
    expect(result.admitted).toBe(2);
    expect(system.rides.ridesOn(day('2025-01-13'))).toHaveLength(2);
  });

  it('counts what the dedupe threw away', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:00:03Z', seq: 2 },
    ]);
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.suppressed).toBe(1);
    expect(result.rides).toHaveLength(1);
  });

  it('counts the turnaways and tallies why', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1, media: CARD_MILO },
      { at: '2025-01-13T18:00:00Z', seq: 2, media: CARD_MILO },
    ]);
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.rides).toEqual([]);
    expect(result.refused).toBe(2);
    expect(result.turnedAway).toBe(2);
    expect([...result.rejections]).toEqual([['lift_not_in_scope', 2]]);
    expect(result.diagnostics.has('recompute.no_rides')).toBe(true);
  });

  it('is safe to run twice', () => {
    const system = harness();
    system.ingest([{ at: '2025-01-13T17:00:00Z', seq: 1 }]);
    recomputeDate(day('2025-01-13'), system);
    recomputeDate(day('2025-01-13'), system);
    expect(system.rides.rides.size).toBe(1);
    expect(system.rides.visits.size).toBe(1);
  });

  it('does nothing quietly for a day with no scans', () => {
    const system = harness();
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.rides).toEqual([]);
    expect(result.diagnostics.has('recompute.no_rides')).toBe(false);
    expect(result.diagnostics.has('recompute.done')).toBe(true);
  });

  it('takes a wider session gap when asked', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T20:00:00Z', seq: 2 },
    ]);
    expect(recomputeDate(day('2025-01-13'), system).visits[0]?.sessions).toHaveLength(2);
    const wide = { ...system, sessionGapMinutes: 400 };
    expect(recomputeDate(day('2025-01-13'), wide).visits[0]?.sessions).toHaveLength(1);
  });
});

describe('the day counter across a rebuild', () => {
  function threeDays() {
    const system = harness();
    system.ingest(
      [{ at: '2025-01-13T17:00:00Z', seq: 1, media: CARD_TESS, terminal: 'MEADW.01' }],
      {
        batch: 'up-1',
        terminal: 'MEADW.01',
      },
    );
    system.ingest(
      [{ at: '2025-01-14T17:00:00Z', seq: 2, media: CARD_TESS, terminal: 'MEADW.01' }],
      {
        batch: 'up-2',
        terminal: 'MEADW.01',
      },
    );
    system.ingest(
      [{ at: '2025-01-15T17:00:00Z', seq: 3, media: CARD_TESS, terminal: 'MEADW.01' }],
      {
        batch: 'up-3',
        terminal: 'MEADW.01',
      },
    );
    system.ingest(
      [{ at: '2025-01-16T17:00:00Z', seq: 4, media: CARD_TESS, terminal: 'MEADW.01' }],
      {
        batch: 'up-4',
        terminal: 'MEADW.01',
      },
    );
    return system;
  }

  it('spends the ticket over the first three days and stops', () => {
    const system = threeDays();
    const results = recomputeDates(
      [day('2025-01-16'), day('2025-01-13'), day('2025-01-14'), day('2025-01-15')],
      system,
    );
    expect(results.map((result) => result.rides.length)).toEqual([1, 1, 1, 0]);
  });

  it('seeds the ledger from the other days when one is rebuilt alone', () => {
    const system = threeDays();
    recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
    const fourth = recomputeDate(day('2025-01-16'), system);
    expect(fourth.rides).toEqual([]);
    expect([...fourth.rejections]).toEqual([['days_exhausted', 1]]);
  });

  it('leaves the day being rebuilt out of its own seed', () => {
    const system = threeDays();
    recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
    const ledger = seedLedger(system, day('2025-01-15'));
    expect([...ledger.daysUsed('ENT-1002')]).toEqual(['2025-01-13', '2025-01-14']);
    expect(recomputeDate(day('2025-01-15'), system).rides).toHaveLength(1);
  });
});
