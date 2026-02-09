import { describe, expect, it } from 'vitest';
import {
  ClosureLog,
  isClosureReason,
  makeClosure,
  type Closure,
} from '../../../../src/domain/calendar/closure.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { calendar2024, day } from '../../../support/season.js';

const calendar = calendar2024();

function closure(overrides: Partial<Parameters<typeof makeClosure>[0]> = {}): Closure {
  return expectOk(
    makeClosure({ date: day('2025-01-14'), reason: 'wind', ...overrides }),
    'closure',
  );
}

describe('a closure', () => {
  it('recognises the reasons the patrol logs', () => {
    expect(isClosureReason('avalanche')).toBe(true);
    expect(isClosureReason('boredom')).toBe(false);
  });

  it('defaults to the whole day and trims the note', () => {
    const built = closure({ note: '  gusting 70  ' });
    expect(built.minutesLost).toBe(0);
    expect(built.note).toBe('gusting 70');
  });

  it('refuses a reason nobody logs and a nonsense duration', () => {
    expect(isErr(makeClosure({ date: day('2025-01-14'), reason: 'boredom' }))).toBe(true);
    expect(isErr(makeClosure({ date: day('2025-01-14'), reason: 'wind', minutesLost: -30 }))).toBe(
      true,
    );
    expect(isErr(makeClosure({ date: day('2025-01-14'), reason: 'wind', minutesLost: 1.5 }))).toBe(
      true,
    );
  });
});

describe('the log', () => {
  it('holds several closures on one day', () => {
    const log = ClosureLog.from([
      closure({ reason: 'wind', minutesLost: 60 }),
      closure({ reason: 'power', minutesLost: 30 }),
    ]);
    expect(log.size).toBe(2);
    expect(log.on(day('2025-01-14'))).toHaveLength(2);
    expect(log.on(day('2025-01-15'))).toEqual([]);
  });

  it('lists everything in date then reason order', () => {
    const log = ClosureLog.from([
      closure({ date: day('2025-01-15'), reason: 'wind' }),
      closure({ date: day('2025-01-14'), reason: 'power' }),
    ]);
    expect(log.all().map((entry) => `${entry.date}/${entry.reason}`)).toEqual([
      '2025-01-14/power',
      '2025-01-15/wind',
    ]);
  });

  it('tallies by reason and names the worst', () => {
    const log = ClosureLog.from([
      closure({ reason: 'wind' }),
      closure({ date: day('2025-01-15'), reason: 'wind' }),
      closure({ date: day('2025-01-16'), reason: 'power' }),
    ]);
    expect([...log.byReason()]).toEqual([
      ['wind', 2],
      ['power', 1],
    ]);
    expect(log.worstReason()).toBe('wind');
    expect(new ClosureLog().worstReason()).toBeUndefined();
  });
});

describe('what a closure costs the denominator', () => {
  it('leaves an ordinary day alone', () => {
    expect(new ClosureLog().minutesOffered(day('2025-01-14'), calendar)).toBe(420);
  });

  it('takes the lost minutes off a partial day', () => {
    const log = ClosureLog.from([closure({ minutesLost: 90 })]);
    expect(log.minutesOffered(day('2025-01-14'), calendar)).toBe(330);
  });

  it('adds two partial closures on one day together', () => {
    const log = ClosureLog.from([
      closure({ minutesLost: 90 }),
      closure({ reason: 'power', minutesLost: 60 }),
    ]);
    expect(log.minutesOffered(day('2025-01-14'), calendar)).toBe(270);
  });

  it('takes the whole day when the closure says so', () => {
    const log = ClosureLog.from([closure({ minutesLost: 0 })]);
    expect(log.minutesOffered(day('2025-01-14'), calendar)).toBe(0);
  });

  it('never goes below nothing', () => {
    const log = ClosureLog.from([closure({ minutesLost: 9_000 })]);
    expect(log.minutesOffered(day('2025-01-14'), calendar)).toBe(0);
  });

  it('leaves a day the calendar already closed at nothing', () => {
    expect(new ClosureLog().minutesOffered(day('2025-01-11'), calendar)).toBe(0);
  });

  it('adds the lost minutes over a period', () => {
    const log = ClosureLog.from([
      closure({ minutesLost: 90 }),
      closure({ date: day('2025-01-15'), minutesLost: 0 }),
    ]);
    expect(log.minutesLost(day('2025-01-13'), day('2025-01-16'), calendar)).toBe(90 + 420);
  });

  it('lists the days that were lost outright', () => {
    const log = ClosureLog.from([
      closure({ minutesLost: 90 }),
      closure({ date: day('2025-01-15'), minutesLost: 0 }),
    ]);
    expect(log.daysLost(day('2025-01-13'), day('2025-01-16'), calendar)).toEqual(['2025-01-15']);
  });
});
