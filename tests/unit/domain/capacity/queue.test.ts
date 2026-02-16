import { describe, expect, it } from 'vitest';
import {
  likelyQueues,
  QUIET_UTILISATION,
  queueProfile,
  readQueue,
  spreadOf,
  STEADY_SPREAD,
} from '../../../../src/domain/capacity/queue.js';
import { SUNBURST } from '../../../support/lifts.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';

function ridesAt(minutes: readonly number[], terminal = 'SUNB.01') {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  const specs: ScanSpec[] = minutes.map((minute, i) => ({
    at: new Date(base + minute * 60_000).toISOString(),
    seq: i + 1,
    terminal,
  }));
  return ridesFrom(specs);
}

describe('the spread', () => {
  it('is nothing for perfectly even gaps', () => {
    expect(spreadOf([60, 60, 60])).toBe(0);
  });

  it('grows with the irregularity', () => {
    expect(spreadOf([10, 600, 20, 900])).toBeGreaterThan(STEADY_SPREAD);
  });

  it('is nothing when there is not enough to measure', () => {
    expect(spreadOf([])).toBe(0);
    expect(spreadOf([60])).toBe(0);
    expect(spreadOf([0, 0])).toBe(0);
  });
});

describe('one lift in one hour', () => {
  it('counts the boardings and the mean gap', () => {
    const reading = readQueue(SUNBURST, ridesAt([0, 10, 20, 30]), 5);
    expect(reading.boardings).toBe(4);
    expect(reading.meanGapSeconds).toBe(600);
    expect(reading.label).toBe('09:00');
  });

  it('calls even spacing at a real rate a queue', () => {
    const reading = readQueue({ ...SUNBURST, carriersPerHour: 1 }, ridesAt([0, 10, 20, 30]), 5);
    expect(reading.spread).toBe(0);
    expect(reading.utilisationPercent).toBeGreaterThanOrEqual(QUIET_UTILISATION);
    expect(reading.queueLikely).toBe(true);
  });

  it('does not call a quiet hour a queue however even it is', () => {
    const reading = readQueue(SUNBURST, ridesAt([0, 10, 20, 30]), 5);
    expect(reading.utilisationPercent).toBeLessThan(QUIET_UTILISATION);
    expect(reading.queueLikely).toBe(false);
  });

  it('does not call a burst a queue', () => {
    const reading = readQueue(
      { ...SUNBURST, carriersPerHour: 1 },
      ridesAt([0, 1, 2, 40, 41, 42]),
      5,
    );
    expect(reading.spread).toBeGreaterThan(STEADY_SPREAD);
    expect(reading.queueLikely).toBe(false);
  });

  it('needs more than a handful of boardings before it says anything', () => {
    const reading = readQueue({ ...SUNBURST, carriersPerHour: 1 }, ridesAt([0, 10]), 5);
    expect(reading.queueLikely).toBe(false);
  });

  it('gives an hour with nothing in it zeroes', () => {
    expect(readQueue(SUNBURST, [], 5)).toMatchObject({
      boardings: 0,
      meanGapSeconds: 0,
      spread: 0,
      utilisationPercent: 0,
      queueLikely: false,
    });
  });
});

describe('the whole day', () => {
  it('gives one reading per lift per hour, in order', () => {
    const rides = [...ridesAt([0, 10, 70]), ...ridesAt([5, 15], 'MEADW.01')];
    const profile = queueProfile(lifts(), rides);
    expect(profile.map((reading) => `${reading.lift}/${reading.hour}`)).toEqual([
      'MEADW/5',
      'SUNB/5',
      'SUNB/6',
    ]);
  });

  it('finds no queue on a quiet day', () => {
    expect(likelyQueues(lifts(), ridesAt([0, 10, 20, 30]))).toEqual([]);
  });

  it('gives nothing for no rides', () => {
    expect(queueProfile(lifts(), [])).toEqual([]);
  });
});
