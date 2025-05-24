import { describe, expect, it } from 'vitest';
import {
  activeDates,
  daySummaries,
  daySummary,
  periodTotals,
  ridesByLiftOn,
  type QueryContext,
} from '../../../src/service/query.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { parseLiftCode } from '../../../src/util/ids.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { CARD_IDA, CARD_TESS } from '../../support/media.js';
import { harness, type Harness } from '../../support/service.js';
import { day } from '../../support/season.js';

const lift = (raw: string) => expectOk(parseLiftCode(raw), 'lift');

function loaded(): { system: Harness; context: QueryContext } {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:40:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_IDA },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  system.ingest([{ at: '2025-01-15T17:00:00Z', seq: 3, terminal: 'RIDGE.01' }], {
    batch: 'up-3',
    terminal: 'RIDGE.01',
  });
  recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
  return {
    system,
    context: {
      rides: system.rides,
      scans: system.scans,
      calendar: system.calendar,
      lifts: system.lifts,
    },
  };
}

describe('one day', () => {
  it('adds the day up', () => {
    const { context } = loaded();
    const summary = daySummary(day('2025-01-13'), context);
    expect(summary).toMatchObject({
      date: '2025-01-13',
      status: 'scheduled',
      dayClass: 'midweek',
      skierVisits: 3,
      visits: 3,
      rides: 4,
      scans: 4,
      liftsTurning: 2,
    });
    expect(summary.verticalFt).toBe(1240 * 2 + 380 * 2);
  });

  it('reads the schedule off the calendar', () => {
    const { context } = loaded();
    expect(daySummary(day('2025-01-13'), context).scheduledMinutes).toBe(420);
    expect(daySummary(day('2025-01-11'), context).status).toBe('weather_hold');
    expect(daySummary(day('2025-01-11'), context).scheduledMinutes).toBe(0);
  });

  it('gives the first and last boarding of the day', () => {
    const { context } = loaded();
    const summary = daySummary(day('2025-01-13'), context);
    expect(summary.firstRideAt?.toISOString()).toBe('2025-01-13T17:00:08.000Z');
    expect(summary.lastRideAt?.toISOString()).toBe('2025-01-13T18:00:08.000Z');
  });

  it('works the per visit numbers out', () => {
    const { context } = loaded();
    const summary = daySummary(day('2025-01-13'), context);
    expect(summary.ridesPerVisit).toBe(1.3);
    expect(summary.verticalPerVisit).toBe(Math.round((1240 * 2 + 380 * 2) / 3));
  });

  it('counts the product mix', () => {
    const { context } = loaded();
    expect([...daySummary(day('2025-01-13'), context).productMix]).toEqual([
      ['SEAS', 1],
      ['A3DAY', 1],
      ['SEASMW', 1],
    ]);
  });

  it('gives a quiet day zeroes rather than nothing', () => {
    const { context } = loaded();
    const summary = daySummary(day('2025-01-14'), context);
    expect(summary).toMatchObject({ rides: 0, visits: 0, skierVisits: 0, verticalFt: 0 });
    expect(summary.firstRideAt).toBeUndefined();
    expect(summary.ridesPerVisit).toBe(0);
    expect(summary.verticalPerVisit).toBe(0);
  });
});

describe('a period', () => {
  it('gives one summary per day inclusive', () => {
    const { context } = loaded();
    const summaries = daySummaries(day('2025-01-13'), day('2025-01-15'), context);
    expect(summaries.map((summary) => summary.date)).toEqual([
      '2025-01-13',
      '2025-01-14',
      '2025-01-15',
    ]);
  });

  it('lists the days that produced anything', () => {
    const { context } = loaded();
    expect(activeDates(day('2025-01-13'), day('2025-01-15'), context)).toEqual([
      '2025-01-13',
      '2025-01-15',
    ]);
  });

  it('totals a period and names the busiest and quietest days', () => {
    const { context } = loaded();
    const totals = periodTotals(day('2025-01-13'), day('2025-01-15'), context);
    expect(totals).toMatchObject({
      operatingDays: 3,
      daysWithTraffic: 2,
      skierVisits: 4,
      rides: 5,
      busiestDate: '2025-01-13',
      quietestDate: '2025-01-15',
    });
  });

  it('gives nothing sensible for an empty period rather than throwing', () => {
    const { context } = loaded();
    const totals = periodTotals(day('2025-02-01'), day('2025-02-03'), context);
    expect(totals.daysWithTraffic).toBe(0);
    expect(totals.busiestDate).toBeUndefined();
  });
});

describe('rides per lift', () => {
  it('counts each lift on the day', () => {
    const { context } = loaded();
    const counts = ridesByLiftOn(day('2025-01-13'), context);
    expect(counts.get(lift('SUNB'))).toBe(2);
    expect(counts.get(lift('MEADW'))).toBe(2);
    expect(counts.get(lift('RIDGE'))).toBeUndefined();
    expect(ridesByLiftOn(day('2025-01-14'), context).size).toBe(0);
  });
});
