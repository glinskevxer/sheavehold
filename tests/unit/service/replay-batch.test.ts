import { describe, expect, it } from 'vitest';
import {
  buildSeasonLedger,
  ledgerExcluding,
  replayDates,
} from '../../../src/service/replay-batch.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { CARD_TESS } from '../../support/media.js';
import { harness, type Harness } from '../../support/service.js';
import { day } from '../../support/season.js';

const DATES = ['2025-01-13', '2025-01-14', '2025-01-15', '2025-01-16'] as const;

function fourDays(): Harness {
  const system = harness();
  DATES.forEach((date, i) => {
    system.ingest([{ at: `${date}T17:00:00Z`, seq: i + 1, terminal: 'SUNB.01' }], {
      batch: `up-sunb-${i}`,
      terminal: 'SUNB.01',
      first: i + 1,
      last: i + 1,
    });
    system.ingest(
      [{ at: `${date}T17:30:00Z`, seq: i + 1, terminal: 'MEADW.01', media: CARD_TESS }],
      { batch: `up-meadw-${i}`, terminal: 'MEADW.01', first: i + 1, last: i + 1 },
    );
  });
  return system;
}

const dates = () => DATES.map((date) => day(date));

describe('the season ledger', () => {
  it('is empty before anything has been rebuilt', () => {
    expect(buildSeasonLedger(fourDays()).size).toBe(0);
  });

  it('holds the days each entitlement has been counted on', () => {
    const system = fourDays();
    recomputeDates(dates(), system);
    expect([...(buildSeasonLedger(system).get('ENT-1001') ?? [])].sort()).toEqual([...DATES]);
  });

  it('lifts one day back out without touching the others', () => {
    const system = fourDays();
    recomputeDates(dates(), system);
    const ledger = ledgerExcluding(buildSeasonLedger(system), day('2025-01-14'));
    expect([...ledger.daysUsed('ENT-1001')].sort()).toEqual([
      '2025-01-13',
      '2025-01-15',
      '2025-01-16',
    ]);
  });
});

describe('replaying a batch of days', () => {
  it('gives the same answer as rebuilding them one at a time', () => {
    const one = fourDays();
    recomputeDates(dates(), one);
    const other = fourDays();
    replayDates(dates(), other);

    expect(other.rides.rides.size).toBe(one.rides.rides.size);
    expect(other.rides.visits.size).toBe(one.rides.visits.size);
    for (const date of dates()) {
      expect(other.rides.ridesOn(date).map((ride) => ride.id)).toEqual(
        one.rides.ridesOn(date).map((ride) => ride.id),
      );
    }
  });

  it('spends the three day ticket on the first three days and no more', () => {
    const system = fourDays();
    const result = replayDates(dates(), system);
    expect(result.results.map((entry) => entry.rides.length)).toEqual([2, 2, 2, 1]);
    expect(system.rides.daysUsedBy('ENT-1002')).toEqual(['2025-01-13', '2025-01-14', '2025-01-15']);
  });

  it('builds the day counter once rather than once a day', () => {
    expect(replayDates(dates(), fourDays()).ledgerBuilds).toBe(1);
  });

  it('totals what it rebuilt', () => {
    const result = replayDates(dates(), fourDays());
    expect(result).toMatchObject({ days: 4, rides: 7 });
    expect(result.visits).toBe(7);
  });

  it('sorts and de-duplicates the days it was given', () => {
    const result = replayDates(
      [day('2025-01-15'), day('2025-01-13'), day('2025-01-13')],
      fourDays(),
    );
    expect(result.results.map((entry) => entry.date)).toEqual(['2025-01-13', '2025-01-15']);
  });

  it('does nothing quietly for no days', () => {
    expect(replayDates([], fourDays())).toMatchObject({ days: 0, rides: 0, visits: 0 });
  });

  it('is stable when it runs twice', () => {
    const system = fourDays();
    replayDates(dates(), system);
    const before = system.rides.rides.size;
    replayDates(dates(), system);
    expect(system.rides.rides.size).toBe(before);
  });
});
