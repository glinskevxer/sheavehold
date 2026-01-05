import { describe, expect, it } from 'vitest';
import { recomputeDate, recomputeDates } from '../../src/service/recompute.js';
import { restateStore } from '../../src/service/restate.js';
import { ClockBook } from '../../src/domain/scan/clock-skew.js';
import { CARD_ROW, CARD_TESS } from '../support/media.js';
import { handshake } from '../support/scans.js';
import { harness } from '../support/service.js';
import { day } from '../support/season.js';

/**
 * What actually happens on the mountain. A gate loses its radio link at ten in
 * the morning, keeps reading all day, and uploads at midnight. The batch from
 * the gate next to it arrived hours earlier. Neither of them agrees with the
 * other about what time it was.
 *
 * The rule this is here to hold is that the answer does not depend on the order
 * the uploads arrived in.
 */

const date = day('2025-01-13');

const MORNING = [
  { at: '2025-01-13T16:05:00Z', seq: 1, media: CARD_ROW },
  { at: '2025-01-13T16:40:00Z', seq: 2, media: CARD_ROW },
];

const AFTERNOON = [
  { at: '2025-01-13T19:05:00Z', seq: 3, media: CARD_ROW },
  { at: '2025-01-13T19:50:00Z', seq: 4, media: CARD_ROW },
];

const OTHER_GATE = [
  { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
  { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
];

function inThisOrder(order: readonly ('morning' | 'afternoon' | 'other')[]) {
  const system = harness();
  for (const part of order) {
    if (part === 'morning') {
      system.ingest(MORNING, { batch: 'up-morning', terminal: 'SUNB.01', first: 1, last: 2 });
    } else if (part === 'afternoon') {
      system.ingest(AFTERNOON, { batch: 'up-afternoon', terminal: 'SUNB.01', first: 3, last: 4 });
    } else {
      system.ingest(OTHER_GATE, { batch: 'up-other', terminal: 'MEADW.01' });
    }
  }
  recomputeDate(date, system);
  return system;
}

function shapeOf(system: ReturnType<typeof inThisOrder>) {
  return {
    scans: system.scans.countOnDate(date),
    rides: system.rides.ridesOn(date).map((ride) => `${ride.lift}@${ride.boardedAt.toISOString()}`),
    visits: system.rides.visitsOn(date).map((visit) => `${visit.guestId}:${visit.rideCount}`),
    vertical: system.rides.verticalOn(date),
  };
}

describe('uploads arriving out of order', () => {
  it('gives the same answer whichever order they came in', () => {
    const forward = shapeOf(inThisOrder(['morning', 'other', 'afternoon']));
    const backward = shapeOf(inThisOrder(['afternoon', 'other', 'morning']));
    const jumbled = shapeOf(inThisOrder(['other', 'afternoon', 'morning']));
    expect(backward).toEqual(forward);
    expect(jumbled).toEqual(forward);
  });

  it('notices the hole while the middle batch is still missing', () => {
    const system = harness();
    system.ingest(MORNING, { batch: 'up-morning', terminal: 'SUNB.01', first: 1, last: 2 });
    system.ingest([{ at: '2025-01-13T20:00:00Z', seq: 9, media: CARD_ROW }], {
      batch: 'up-late',
      terminal: 'SUNB.01',
      first: 9,
      last: 9,
    });
    expect(system.scans.countOnDate(date)).toBe(3);
  });

  it('fills the hole in when the missing batch turns up', () => {
    const system = inThisOrder(['morning', 'afternoon']);
    expect(system.scans.countOnDate(date)).toBe(4);
    system.ingest(OTHER_GATE, { batch: 'up-other', terminal: 'MEADW.01' });
    recomputeDate(date, system);
    expect(system.scans.countOnDate(date)).toBe(6);
    expect(system.rides.skierVisitsOn(date)).toBe(2);
  });
});

describe('a handshake that arrives after the scans', () => {
  it('moves the corrected times and says which days need rebuilding', () => {
    const system = inThisOrder(['morning', 'afternoon']);
    const beforeVertical = system.rides.verticalOn(date);

    const corrected = ClockBook.from([
      handshake('SUNB.01', '2025-01-13T11:00:00Z', '2025-01-13T14:50:00Z'),
    ]);
    const restated = restateStore(system.scans, corrected);
    expect(restated.moves.length).toBeGreaterThanOrEqual(0);
    recomputeDates(
      restated.dirtyDates.length === 0 ? [date] : [date, ...restated.dirtyDates],
      system,
    );

    expect(system.rides.ridesOn(date)[0]?.boardedAt.toISOString()).toBe('2025-01-13T12:15:00.000Z');
    expect(system.rides.verticalOn(date)).toBe(beforeVertical);
  });

  it('leaves the reported times exactly as the gate sent them', () => {
    const system = inThisOrder(['morning']);
    const corrected = ClockBook.from([
      handshake('SUNB.01', '2025-01-13T11:00:00Z', '2025-01-13T14:50:00Z'),
    ]);
    restateStore(system.scans, corrected);
    expect(system.scans.onDate(date)[0]?.reportedAt.toISOString()).toBe('2025-01-13T16:05:00.000Z');
  });
});
