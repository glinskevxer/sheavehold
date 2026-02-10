import { describe, expect, it } from 'vitest';
import {
  coversMinute,
  HoldLog,
  holdMinutes,
  makeHold,
  mergeHolds,
  stoppedMinutes,
  type Hold,
} from '../../../../src/domain/lift/hold.js';
import { parseLiftCode, type LiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

const lift = (raw: string): LiftCode => expectOk(parseLiftCode(raw), 'lift');
const date = day('2025-01-13');

function hold(overrides: Partial<Parameters<typeof makeHold>[0]> = {}): Hold {
  return expectOk(
    makeHold({
      lift: lift('RIDGE'),
      date,
      fromMinute: 420,
      toMinute: 540,
      reason: 'wind',
      ...overrides,
    }),
    'hold',
  );
}

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T11:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

describe('one hold', () => {
  it('measures its own length and trims its note', () => {
    const built = hold({ note: '  gusting  ' });
    expect(holdMinutes(built)).toBe(120);
    expect(built.note).toBe('gusting');
  });

  it('covers a half open interval', () => {
    const built = hold();
    expect(coversMinute(built, 420)).toBe(true);
    expect(coversMinute(built, 539)).toBe(true);
    expect(coversMinute(built, 540)).toBe(false);
    expect(coversMinute(built, 419)).toBe(false);
  });

  it('refuses a hold that ends before it starts or begins before the day', () => {
    expect(isErr(makeHold({ ...hold(), toMinute: 420 }))).toBe(true);
    expect(isErr(makeHold({ ...hold(), fromMinute: -30 }))).toBe(true);
    expect(isErr(makeHold({ ...hold(), fromMinute: 1.5, toMinute: 9 }))).toBe(true);
  });
});

describe('merging overlapping holds', () => {
  it('leaves two separate holds alone', () => {
    expect(mergeHolds([hold(), hold({ fromMinute: 600, toMinute: 660 })])).toEqual([
      { from: 420, to: 540 },
      { from: 600, to: 660 },
    ]);
  });

  it('joins two that overlap', () => {
    expect(mergeHolds([hold(), hold({ fromMinute: 500, toMinute: 600 })])).toEqual([
      { from: 420, to: 600 },
    ]);
  });

  it('joins two that touch', () => {
    expect(mergeHolds([hold(), hold({ fromMinute: 540, toMinute: 600 })])).toEqual([
      { from: 420, to: 600 },
    ]);
  });

  it('swallows one inside another', () => {
    expect(mergeHolds([hold(), hold({ fromMinute: 450, toMinute: 480 })])).toEqual([
      { from: 420, to: 540 },
    ]);
  });

  it('counts overlapping minutes once', () => {
    expect(stoppedMinutes([hold(), hold({ fromMinute: 500, toMinute: 600 })])).toBe(180);
    expect(stoppedMinutes([])).toBe(0);
  });
});

describe('the hold log', () => {
  const log = () =>
    HoldLog.from([
      hold(),
      hold({ fromMinute: 500, toMinute: 600 }),
      hold({ lift: lift('SUNB'), fromMinute: 300, toMinute: 330 }),
      hold({ date: day('2025-01-14'), fromMinute: 300, toMinute: 400 }),
    ]);

  it('holds everything and slices by lift and day', () => {
    expect(log().size).toBe(4);
    expect(log().on(lift('RIDGE'), date)).toHaveLength(2);
    expect(log().on(lift('BOWL'), date)).toEqual([]);
  });

  it('counts overlapping stoppages once', () => {
    expect(log().stoppedOn(lift('RIDGE'), date)).toBe(180);
    expect(log().stoppedOn(lift('SUNB'), date)).toBe(30);
    expect(log().stoppedOn(lift('BOWL'), date)).toBe(0);
  });

  it('shrinks the running minutes rather than the schedule', () => {
    expect(log().runningMinutes(lift('RIDGE'), date, 420)).toBe(240);
    expect(log().runningMinutes(lift('RIDGE'), date, 60)).toBe(0);
    expect(log().runningMinutes(lift('BOWL'), date, 420)).toBe(420);
  });

  it('groups the stoppage by lift and names the worst', () => {
    expect([...log().byLift(date)]).toEqual([
      ['RIDGE', 180],
      ['SUNB', 30],
    ]);
    expect(log().worstOn(date)).toBe('RIDGE');
    expect(log().worstOn(day('2025-02-01'))).toBeUndefined();
  });

  it('finds a ride that boarded while its lift was logged as stopped', () => {
    const rides = ridesFrom([at(430, { terminal: 'RIDGE.01' }), at(700, { terminal: 'RIDGE.01' })]);
    const found = log().ridesDuringHolds(rides);
    expect(found).toHaveLength(1);
    expect(found[0]?.lift).toBe('RIDGE');
  });

  it('finds nothing when the lift was turning', () => {
    expect(log().ridesDuringHolds(ridesFrom([at(700, { terminal: 'RIDGE.01' })]))).toEqual([]);
  });
});
