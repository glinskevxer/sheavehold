import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CERTAIN_FRACTION,
  DEFAULT_DESCENT_FRACTION,
  findSameLiftPassbacks,
  minimumLapMinutes,
  passbacksOfConfidence,
  repeatOffenders,
} from '../../../../src/domain/exception/passback.js';
import { CARD_TESS } from '../../../support/media.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

const options = () => ({ lifts: lifts() });

describe('the minimum lap', () => {
  it('is the ride plus the fastest descent under it', () => {
    expect(minimumLapMinutes(7.5, DEFAULT_DESCENT_FRACTION)).toBe(10.1);
    expect(minimumLapMinutes(11, 0.5)).toBe(16.5);
    expect(DEFAULT_CERTAIN_FRACTION).toBe(0.5);
  });
});

describe('finding a pass-back on one lift', () => {
  it('flags two boards inside the minimum lap', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(6, { terminal: 'SUNB.01' })]);
    const found = findSameLiftPassbacks(rides, options());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      lift: 'SUNB',
      gapMinutes: 6,
      minimumLapMinutes: 10.1,
      guestId: 'G-77',
      entitlementId: 'ENT-1001',
    });
  });

  it('leaves an honest lap alone', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(14, { terminal: 'SUNB.01' })]);
    expect(findSameLiftPassbacks(rides, options())).toEqual([]);
  });

  it('leaves a change of lift to the other rule', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(3, { terminal: 'RIDGE.01' })]);
    expect(findSameLiftPassbacks(rides, options())).toEqual([]);
  });

  it('uses each lift own threshold', () => {
    const gondola = ridesFrom([at(0, { terminal: 'RIDGE.01' }), at(13, { terminal: 'RIDGE.01' })]);
    expect(findSameLiftPassbacks(gondola, options())).toHaveLength(1);
    const carpet = ridesFrom([at(0, { terminal: 'CRPT.01' }), at(13, { terminal: 'CRPT.01' })]);
    expect(findSameLiftPassbacks(carpet, options())).toEqual([]);
  });

  it('grades how sure it is', () => {
    const certain = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(4, { terminal: 'SUNB.01' })]);
    expect(findSameLiftPassbacks(certain, options())[0]?.confidence).toBe('certain');
    const likely = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(7, { terminal: 'SUNB.01' })]);
    expect(findSameLiftPassbacks(likely, options())[0]?.confidence).toBe('likely');
    const possible = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(9, { terminal: 'SUNB.01' })]);
    expect(findSameLiftPassbacks(possible, options())[0]?.confidence).toBe('possible');
  });

  it('takes a stricter descent when the snow is slow', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(12, { terminal: 'SUNB.01' })]);
    expect(findSameLiftPassbacks(rides, options())).toEqual([]);
    expect(findSameLiftPassbacks(rides, { ...options(), descentFraction: 1 })).toHaveLength(1);
  });

  it('keeps two cards apart', () => {
    const rides = [
      ...ridesFrom([at(0, { terminal: 'MEADW.01' })]),
      ...ridesFrom([at(1, { terminal: 'MEADW.01', media: CARD_TESS })]),
    ];
    expect(findSameLiftPassbacks(rides, options())).toEqual([]);
  });

  it('walks a run of quick boards pair by pair', () => {
    const rides = ridesFrom([
      at(0, { terminal: 'SUNB.01' }),
      at(6, { terminal: 'SUNB.01' }),
      at(12, { terminal: 'SUNB.01' }),
    ]);
    expect(findSameLiftPassbacks(rides, options())).toHaveLength(2);
  });

  it('filters by confidence and finds the repeat offenders', () => {
    const rides = ridesFrom([
      at(0, { terminal: 'SUNB.01' }),
      at(4, { terminal: 'SUNB.01' }),
      at(8, { terminal: 'SUNB.01' }),
    ]);
    const found = findSameLiftPassbacks(rides, options());
    expect(passbacksOfConfidence(found, 'certain')).toHaveLength(2);
    expect(passbacksOfConfidence(found, 'possible')).toEqual([]);
    expect(repeatOffenders(found)).toHaveLength(1);
  });

  it('finds nothing in a quiet day', () => {
    expect(findSameLiftPassbacks(ridesFrom([at(0)]), options())).toEqual([]);
    expect(findSameLiftPassbacks([], options())).toEqual([]);
    expect(repeatOffenders([])).toEqual([]);
  });
});
