import { describe, expect, it } from 'vitest';
import {
  fastestLapMinutes,
  LiftSpeedModel,
  MAX_SPEED_FACTOR,
  MIN_SPEED_FACTOR,
  MIN_TURNAROUNDS,
  percentile,
  ridingAt,
  speedFactor,
  turnarounds,
  unloadEstimate,
} from '../../../../src/domain/ride/ride-time.js';
import { parseLiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { SUNBURST } from '../../../support/lifts.js';
import { CARD_TESS } from '../../../support/media.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';

const lift = (raw: string) => expectOk(parseLiftCode(raw), 'lift');

function laps(count: number, gapMinutes: number, media?: string): ScanSpec[] {
  const start = new Date('2025-01-13T17:00:00Z').getTime();
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(start + i * gapMinutes * 60_000).toISOString(),
    media,
    seq: i + 1,
  }));
}

describe('turnarounds', () => {
  it('measures the gap between two rides on the same lift', () => {
    const found = turnarounds(ridesFrom(laps(3, 15)));
    expect(found).toHaveLength(2);
    expect(found[0]?.minutes).toBe(15);
    expect(found[0]?.lift).toBe('SUNB');
  });

  it('ignores a change of lift', () => {
    const found = turnarounds(
      ridesFrom([
        { at: '2025-01-13T17:00:00Z', terminal: 'SUNB.01' },
        { at: '2025-01-13T17:20:00Z', terminal: 'RIDGE.01' },
      ]),
    );
    expect(found).toEqual([]);
  });

  it('keeps two guests apart', () => {
    const found = turnarounds([
      ...ridesFrom(laps(2, 15)),
      ...ridesFrom(laps(2, 15, CARD_TESS).map((spec) => ({ ...spec, terminal: 'MEADW.01' }))),
    ]);
    expect(found).toHaveLength(2);
    expect(new Set(found.map((entry) => entry.guestId)).size).toBe(2);
  });

  it('finds nothing in a single ride', () => {
    expect(turnarounds(ridesFrom(laps(1, 15)))).toEqual([]);
  });
});

describe('percentiles', () => {
  it('answers nothing for an empty set', () => {
    expect(percentile([], 0.5)).toBeUndefined();
  });

  it('takes the low end and the high end', () => {
    expect(percentile([5, 1, 9, 3], 0)).toBe(1);
    expect(percentile([5, 1, 9, 3], 1)).toBe(9);
    expect(percentile([5, 1, 9, 3], 0.5)).toBe(5);
  });
});

describe('the fastest lap', () => {
  it('says nothing until enough people have done laps', () => {
    expect(fastestLapMinutes(ridesFrom(laps(4, 15)), lift('SUNB'))).toBeUndefined();
    expect(MIN_TURNAROUNDS).toBe(8);
  });

  it('takes the fifth percentile once there are enough', () => {
    expect(fastestLapMinutes(ridesFrom(laps(12, 15)), lift('SUNB'))).toBe(15);
  });
});

describe('the speed factor', () => {
  it('is one when nobody did enough laps', () => {
    expect(speedFactor(SUNBURST, undefined)).toBe(1);
  });

  it('reads a slow lift off a long lap', () => {
    expect(speedFactor(SUNBURST, 15)).toBeGreaterThan(1);
  });

  it('clamps at both ends', () => {
    expect(speedFactor(SUNBURST, 4)).toBe(MIN_SPEED_FACTOR);
    expect(speedFactor(SUNBURST, 300)).toBe(MAX_SPEED_FACTOR);
  });

  it('is one when the implied ride comes out at nothing', () => {
    expect(speedFactor(SUNBURST, 3)).toBe(1);
  });
});

describe('the model over a day', () => {
  it('reports only the lifts that turned', () => {
    const model = LiftSpeedModel.observe(ridesFrom(laps(12, 15)), lifts());
    expect(model.size).toBe(1);
    expect(model.all().map((reading) => reading.lift)).toEqual(['SUNB']);
    expect(model.reading(lift('BOWL'))).toBeUndefined();
  });

  it('marks a lift with too few laps as not confident and leaves it at one', () => {
    const model = LiftSpeedModel.observe(ridesFrom(laps(3, 15)), lifts());
    const reading = model.reading(lift('SUNB'));
    expect(reading?.confident).toBe(false);
    expect(reading?.factor).toBe(1);
    expect(model.factorFor(lift('SUNB'))).toBe(1);
  });

  it('flags a lift that ran slow all day', () => {
    const model = LiftSpeedModel.observe(ridesFrom(laps(12, 22)), lifts());
    expect(model.runningSlow().map((reading) => reading.lift)).toEqual(['SUNB']);
    expect(model.reading(lift('SUNB'))?.observedMinutes).toBeGreaterThan(7.5);
  });

  it('leaves a lift running to time off the slow list', () => {
    const model = LiftSpeedModel.observe(ridesFrom(laps(12, 11)), lifts());
    expect(model.runningSlow()).toEqual([]);
  });

  it('falls back to one for a lift it has never seen', () => {
    expect(new LiftSpeedModel().factorFor(lift('BOWL'))).toBe(1);
  });
});

describe('who is on the wire', () => {
  it('stretches the unload estimate by the observed factor', () => {
    const rides = ridesFrom(laps(12, 22));
    const model = LiftSpeedModel.observe(rides, lifts());
    const first = rides[0]!;
    expect(unloadEstimate(first, model).getTime()).toBeGreaterThan(first.unloadsAt.getTime());
  });

  it('lists the rides still going up at a moment', () => {
    const rides = ridesFrom(laps(3, 15));
    const model = new LiftSpeedModel();
    expect(ridingAt(rides, new Date('2025-01-13T17:03:00Z'), model)).toHaveLength(1);
    expect(ridingAt(rides, new Date('2025-01-13T17:12:00Z'), model)).toEqual([]);
    expect(ridingAt(rides, new Date('2025-01-13T16:00:00Z'), model)).toEqual([]);
  });
});
