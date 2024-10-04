import { describe, expect, it } from 'vitest';
import {
  averageGradePercent,
  designCapacityPerHour,
  isLiftKind,
  isLiftStatus,
  LiftRegistry,
  makeLift,
  ridesTurnableIn,
  verticalCapacityPerHour,
  verticalRiseFt,
} from '../../../../src/domain/lift/lift.js';
import { parseLiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import {
  ALL_LIFTS,
  BOWL,
  CARPET,
  liftOf,
  MEADOW,
  RIDGELINE,
  SUNBURST,
} from '../../../support/lifts.js';

const code = (raw: string) => expectOk(parseLiftCode(raw), 'code');

describe('lift numbers', () => {
  it('takes the rise off the two elevations', () => {
    expect(verticalRiseFt(SUNBURST)).toBe(1240);
    expect(verticalRiseFt(RIDGELINE)).toBe(1880);
  });

  it('multiplies carriers by seats for the design capacity', () => {
    expect(designCapacityPerHour(SUNBURST)).toBe(2400);
    expect(designCapacityPerHour(RIDGELINE)).toBe(2080);
    expect(designCapacityPerHour(CARPET)).toBe(1400);
  });

  it('gives vertical capacity as people times rise', () => {
    expect(verticalCapacityPerHour(SUNBURST)).toBe(2400 * 1240);
  });

  it('works the grade out along the line', () => {
    expect(averageGradePercent(MEADOW)).toBeCloseTo(22.7, 1);
    expect(averageGradePercent(liftOf({ slopeLengthFt: 1240 }))).toBe(0);
  });

  it('turns nobody in no time', () => {
    expect(ridesTurnableIn(SUNBURST, 60)).toBe(2400);
    expect(ridesTurnableIn(SUNBURST, 30)).toBe(1200);
    expect(ridesTurnableIn(SUNBURST, 0)).toBe(0);
    expect(ridesTurnableIn(SUNBURST, -5)).toBe(0);
  });
});

describe('building a lift', () => {
  it('recognises the kinds and statuses we run', () => {
    expect(isLiftKind('gondola')).toBe(true);
    expect(isLiftKind('funicular')).toBe(false);
    expect(isLiftStatus('seasonal')).toBe(true);
    expect(isLiftStatus('mothballed')).toBe(false);
  });

  it('trims the name and folds the code', () => {
    const lift = expectOk(makeLift({ ...SUNBURST, code: 'sunb', name: '  Sunburst  ' }), 'lift');
    expect(lift.code).toBe('SUNB');
    expect(lift.name).toBe('Sunburst');
  });

  it('refuses a lift that tops out below its base', () => {
    expect(isErr(makeLift({ ...SUNBURST, topElevationFt: 8000 }))).toBe(true);
  });

  it('refuses a rise longer than the line it hangs on', () => {
    expect(isErr(makeLift({ ...SUNBURST, slopeLengthFt: 900 }))).toBe(true);
  });

  it('refuses zero or negative measurements', () => {
    expect(isErr(makeLift({ ...SUNBURST, carriersPerHour: 0 }))).toBe(true);
    expect(isErr(makeLift({ ...SUNBURST, rideMinutes: -1 }))).toBe(true);
    expect(isErr(makeLift({ ...SUNBURST, slopeLengthFt: Number.NaN }))).toBe(true);
  });

  it('refuses a fractional seat', () => {
    expect(isErr(makeLift({ ...SUNBURST, carrierCapacity: 2.5 }))).toBe(true);
  });

  it('refuses an empty name, a bad kind and a bad status', () => {
    expect(isErr(makeLift({ ...SUNBURST, name: '   ' }))).toBe(true);
    expect(isErr(makeLift({ ...SUNBURST, kind: 'funicular' }))).toBe(true);
    expect(isErr(makeLift({ ...SUNBURST, status: 'mothballed' }))).toBe(true);
    expect(isErr(makeLift({ ...SUNBURST, code: 'S1' }))).toBe(true);
  });
});

describe('the registry', () => {
  const registry = LiftRegistry.from(ALL_LIFTS);

  it('holds every lift and finds one by code', () => {
    expect(registry.size).toBe(7);
    expect(registry.get(code('BOWL'))).toBe(BOWL);
    expect(registry.has(code('POMA'))).toBe(true);
    expect(registry.find(code('NOPE'))).toBeUndefined();
  });

  it('throws with a code when the lift is not there', () => {
    expect(() => registry.get(code('NOPE'))).toThrow('no lift NOPE');
  });

  it('refuses to register the same code twice', () => {
    const one = LiftRegistry.from([SUNBURST]);
    expect(() => one.add(SUNBURST)).toThrow('already registered');
  });

  it('orders by descending rise, then by code', () => {
    expect(registry.all().map((lift) => lift.code)).toEqual([
      'RIDGE',
      'BOWL',
      'SUNB',
      'OLDDB',
      'POMA',
      'MEADW',
      'CRPT',
    ]);
  });

  it('separates the running lifts from the seasonal and the retired', () => {
    expect(registry.inService().map((lift) => lift.code)).toEqual([
      'RIDGE',
      'BOWL',
      'SUNB',
      'MEADW',
      'CRPT',
    ]);
    expect(registry.beginnerLifts().map((lift) => lift.code)).toEqual(['MEADW', 'CRPT']);
  });

  it('adds the vertical capacity of the running lifts only', () => {
    const expected = registry
      .inService()
      .reduce((total, lift) => total + verticalCapacityPerHour(lift), 0);
    expect(registry.totalVerticalCapacityPerHour()).toBe(expected);
  });
});
