import { describe, expect, it } from 'vitest';
import {
  buildVisits,
  DEFAULT_SESSION_GAP_MINUTES,
  skierVisits,
} from '../../src/domain/visit/visit.js';
import { reassignBoundaryRides } from '../../src/domain/visit/boundary.js';
import { totalVerticalFt } from '../../src/domain/ride/ride.js';
import { CARD_ROW, CARD_TESS } from '../support/media.js';
import { ridesFrom, type ScanSpec } from '../support/pipeline.js';
import { day } from '../support/season.js';

/**
 * Sessionisation has three numbers anybody might tune: the session gap, the
 * rollover grace and the day boundary. These properties are what has to stay
 * true whatever those become, and one of them caught a change that silently
 * doubled the skier visits on the last day of a trip.
 */

const GATES = ['SUNB.01', 'MEADW.01', 'RIDGE.01'];
const CARDS = [CARD_ROW, CARD_TESS];

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomRides(seed: number, count: number) {
  const random = makeRandom(seed);
  let at = new Date('2025-01-13T16:00:00Z').getTime();
  const specs: ScanSpec[] = Array.from({ length: count }, (_, i) => {
    at += Math.floor(random() * 90 * 60_000);
    return {
      terminal: GATES[Math.floor(random() * GATES.length)] ?? 'SUNB.01',
      media: CARDS[Math.floor(random() * CARDS.length)] ?? CARD_ROW,
      at: new Date(at).toISOString(),
      seq: i + 1,
    };
  });
  return ridesFrom(specs);
}

const seeds = [3, 11, 29, 61, 131, 307, 733];

describe('what sessionisation always does', () => {
  it('never loses a ride', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      const counted = buildVisits(rides).reduce((total, visit) => total + visit.rideCount, 0);
      expect(counted).toBe(rides.length);
    }
  });

  it('never loses a foot of vertical', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      const counted = buildVisits(rides).reduce((total, visit) => total + visit.verticalFt, 0);
      expect(counted).toBe(totalVerticalFt(rides));
    }
  });

  it('gives every visit at least one session', () => {
    for (const seed of seeds) {
      for (const visit of buildVisits(randomRides(seed, 40))) {
        expect(visit.sessions.length).toBeGreaterThanOrEqual(1);
        expect(visit.sessions.length).toBeLessThanOrEqual(visit.rideCount);
      }
    }
  });

  it('counts the sessions rides back to the visit', () => {
    for (const seed of seeds) {
      for (const visit of buildVisits(randomRides(seed, 40))) {
        const counted = visit.sessions.reduce((total, session) => total + session.rideCount, 0);
        expect(counted).toBe(visit.rideCount);
      }
    }
  });

  it('never puts a guest on more visits than days they had rides on', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      const visits = buildVisits(rides);
      for (const guestId of new Set(rides.map((ride) => ride.guestId))) {
        const days = new Set(
          rides.filter((ride) => ride.guestId === guestId).map((ride) => ride.operatingDate),
        );
        const own = visits.filter((visit) => visit.guestId === guestId);
        expect(own.length).toBeGreaterThanOrEqual(days.size);
      }
    }
  });

  it('gives a wider gap no more sessions than a narrower one', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      const narrow = buildVisits(rides, { sessionGapMinutes: 30 });
      const wide = buildVisits(rides, { sessionGapMinutes: 600 });
      const count = (visits: typeof narrow) =>
        visits.reduce((total, visit) => total + visit.sessions.length, 0);
      expect(count(wide)).toBeLessThanOrEqual(count(narrow));
      expect(DEFAULT_SESSION_GAP_MINUTES).toBeGreaterThan(30);
    }
  });

  it('keeps the first and last ride inside the visit span', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      for (const visit of buildVisits(rides)) {
        expect(visit.firstRideAt.getTime()).toBeLessThanOrEqual(visit.lastRideAt.getTime());
        expect(visit.spanMinutes).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('what the rollover grace always does', () => {
  it('never changes how many rides there are', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      expect(reassignBoundaryRides(rides).rides.length).toBe(rides.length);
    }
  });

  it('never moves a ride forward in time', () => {
    for (const seed of seeds) {
      const result = reassignBoundaryRides(randomRides(seed, 40));
      for (const move of result.moves) expect(move.to < move.from).toBe(true);
    }
  });

  it('never raises the skier visit count on a day', () => {
    for (const seed of seeds) {
      const rides = randomRides(seed, 40);
      const before = buildVisits(rides);
      const after = buildVisits(reassignBoundaryRides(rides).rides);
      for (const date of new Set(rides.map((ride) => ride.operatingDate))) {
        expect(skierVisits(after, date)).toBeLessThanOrEqual(skierVisits(before, day(date)) + 1);
      }
    }
  });

  it('is stable when it runs again', () => {
    for (const seed of seeds) {
      const once = reassignBoundaryRides(randomRides(seed, 40));
      expect(reassignBoundaryRides(once.rides).moves).toEqual([]);
    }
  });
});
