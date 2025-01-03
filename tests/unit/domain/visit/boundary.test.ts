import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRACE_MINUTES,
  isJustAfterBoundary,
  movedRideIds,
  movesOnDate,
  plainOperatingDay,
  reassignBoundaryRides,
} from '../../../../src/domain/visit/boundary.js';
import { buildVisits, skierVisits } from '../../../../src/domain/visit/visit.js';
import { CARD_TESS } from '../../../support/media.js';
import { ridesFrom } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

const pair = () =>
  ridesFrom([
    { at: '2025-01-14T10:40:00Z', seq: 1 },
    { at: '2025-01-14T11:15:00Z', seq: 2 },
  ]);

describe('spotting a ride just after the rollover', () => {
  it('knows a ride at ten past four from one at nine in the morning', () => {
    const [late] = ridesFrom([{ at: '2025-01-14T11:10:00Z' }]);
    const [morning] = ridesFrom([{ at: '2025-01-13T17:00:00Z' }]);
    expect(isJustAfterBoundary(late!, DEFAULT_GRACE_MINUTES)).toBe(true);
    expect(isJustAfterBoundary(morning!, DEFAULT_GRACE_MINUTES)).toBe(false);
  });

  it('stops caring once the grace has run out', () => {
    const [outside] = ridesFrom([{ at: '2025-01-14T11:50:00Z' }]);
    expect(isJustAfterBoundary(outside!, DEFAULT_GRACE_MINUTES)).toBe(false);
    expect(isJustAfterBoundary(outside!, 60)).toBe(true);
  });
});

describe('pulling a late ride back onto the day it belongs to', () => {
  it('moves a ride when the guest was already out', () => {
    const result = reassignBoundaryRides(pair());
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]).toMatchObject({ from: '2025-01-14', to: '2025-01-13' });
    expect(result.rides.every((ride) => ride.operatingDate === '2025-01-13')).toBe(true);
  });

  it('leaves a ride alone when the guest had not skied the day before', () => {
    const result = reassignBoundaryRides(ridesFrom([{ at: '2025-01-14T11:15:00Z' }]));
    expect(result.moves).toEqual([]);
    expect(result.rides[0]?.operatingDate).toBe('2025-01-14');
  });

  it('leaves a ride outside the grace window alone', () => {
    const rides = ridesFrom([
      { at: '2025-01-14T10:40:00Z', seq: 1 },
      { at: '2025-01-14T12:30:00Z', seq: 2 },
    ]);
    expect(reassignBoundaryRides(rides).moves).toEqual([]);
  });

  it('takes a wider grace when asked', () => {
    const rides = ridesFrom([
      { at: '2025-01-14T10:40:00Z', seq: 1 },
      { at: '2025-01-14T11:50:00Z', seq: 2 },
    ]);
    expect(reassignBoundaryRides(rides, { graceMinutes: 90 }).moves).toHaveLength(1);
  });

  it('only moves the guest who was already out', () => {
    const rides = [
      ...pair(),
      ...ridesFrom([
        { at: '2025-01-14T11:15:00Z', seq: 3, media: CARD_TESS, terminal: 'MEADW.01' },
      ]),
    ];
    const result = reassignBoundaryRides(rides);
    expect(result.moves.map((move) => move.guestId)).toEqual(['G-77']);
  });

  it('keeps the plain answer available for the audit trail', () => {
    const result = reassignBoundaryRides(pair());
    const late = result.rides.find((ride) => ride.sequence === 2)!;
    expect(late.operatingDate).toBe('2025-01-13');
    expect(plainOperatingDay(late)).toBe('2025-01-14');
  });

  it('leaves the boarding time exactly where it was', () => {
    const result = reassignBoundaryRides(pair());
    const late = result.rides.find((ride) => ride.sequence === 2)!;
    expect(late.boardedAt.toISOString()).toBe('2025-01-14T11:15:08.000Z');
  });

  it('lists what moved onto a day', () => {
    const result = reassignBoundaryRides(pair());
    expect(movesOnDate(result, day('2025-01-13'))).toHaveLength(1);
    expect(movesOnDate(result, day('2025-01-14'))).toEqual([]);
    expect(movedRideIds(result)).toEqual(['R-2025-01-14-SUNB.01-000002']);
  });
});

describe('what it does to the visit count', () => {
  it('turns two visits back into one', () => {
    const rides = pair();
    expect(skierVisits(buildVisits(rides), day('2025-01-14'))).toBe(1);
    const fixed = reassignBoundaryRides(rides);
    expect(skierVisits(buildVisits(fixed.rides), day('2025-01-14'))).toBe(0);
    expect(skierVisits(buildVisits(fixed.rides), day('2025-01-13'))).toBe(1);
  });

  it('leaves an ordinary day untouched', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z' }, { at: '2025-01-13T18:00:00Z' }]);
    const result = reassignBoundaryRides(rides);
    expect(result.moves).toEqual([]);
    expect(result.rides).toHaveLength(2);
  });
});
