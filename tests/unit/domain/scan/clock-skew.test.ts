import { describe, expect, it } from 'vitest';
import {
  ClockBook,
  DRIFT_ALARM_PPM,
  driftPpm,
  handshakeOffsetMs,
  TerminalClock,
  type ClockHandshake,
} from '../../../../src/domain/scan/clock-skew.js';
import { parseTerminalId, type TerminalId } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';

const terminal = (raw: string): TerminalId => expectOk(parseTerminalId(raw), 'terminal');
const SUNB = terminal('SUNB.01');
const RIDGE = terminal('RIDGE.01');

function shake(serverAt: string, terminalAt: string, id: TerminalId = SUNB): ClockHandshake {
  return { terminalId: id, serverAt: new Date(serverAt), terminalAt: new Date(terminalAt) };
}

describe('a single handshake', () => {
  it('measures how far behind the terminal is', () => {
    expect(handshakeOffsetMs(shake('2025-01-13T11:00:00Z', '2025-01-13T10:59:55Z'))).toBe(5_000);
    expect(handshakeOffsetMs(shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:09Z'))).toBe(-9_000);
  });

  it('gives the drift between two of them in parts per million', () => {
    const drift = driftPpm({ serverMs: 0, offsetMs: 0 }, { serverMs: 86_400_000, offsetMs: 8_640 });
    expect(Math.round(drift)).toBe(100);
    expect(driftPpm({ serverMs: 10, offsetMs: 0 }, { serverMs: 10, offsetMs: 50 })).toBe(0);
  });
});

describe('one terminal clock', () => {
  it('corrects by nothing when nobody has ever handshaked', () => {
    const clock = new TerminalClock(SUNB);
    expect(clock.count).toBe(0);
    expect(clock.offsetMsAt(new Date('2025-01-13T16:00:00Z'))).toBe(0);
    expect(clock.correct(new Date('2025-01-13T16:00:00Z')).toISOString()).toBe(
      '2025-01-13T16:00:00.000Z',
    );
  });

  it('holds the first offset flat before the first handshake', () => {
    const clock = TerminalClock.from(SUNB, [shake('2025-01-13T11:00:00Z', '2025-01-13T10:59:55Z')]);
    expect(clock.offsetMsAt(new Date('2025-01-10T10:00:00Z'))).toBe(5_000);
  });

  it('holds the last offset flat after the last handshake', () => {
    const clock = TerminalClock.from(SUNB, [shake('2025-01-13T11:00:00Z', '2025-01-13T10:59:55Z')]);
    expect(clock.offsetMsAt(new Date('2025-02-01T10:00:00Z'))).toBe(5_000);
  });

  it('interpolates between two handshakes', () => {
    const clock = TerminalClock.from(SUNB, [
      shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
      shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:52Z'),
    ]);
    expect(clock.offsetMsAt(new Date('2025-01-13T23:00:00Z'))).toBe(4_000);
    expect(clock.offsetMsAt(new Date('2025-01-13T17:00:00Z'))).toBe(2_000);
  });

  it('shifts a reading forward by the interpolated offset', () => {
    const clock = TerminalClock.from(SUNB, [
      shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
      shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:52Z'),
    ]);
    expect(clock.correct(new Date('2025-01-13T23:00:00Z')).toISOString()).toBe(
      '2025-01-13T23:00:04.000Z',
    );
  });

  it('sorts handshakes that arrive out of order', () => {
    const clock = TerminalClock.from(SUNB, [
      shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:52Z'),
      shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
    ]);
    expect(clock.all().map((entry) => entry.offsetMs)).toEqual([0, 8_000]);
  });

  it('refuses a handshake for another terminal or with a bad time', () => {
    const clock = new TerminalClock(SUNB);
    expect(isErr(clock.record(shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z', RIDGE)))).toBe(
      true,
    );
    expect(
      isErr(clock.record({ terminalId: SUNB, serverAt: new Date('x'), terminalAt: new Date() })),
    ).toBe(true);
  });
});

describe('when a clock needs a work order', () => {
  it('leaves a well behaved crystal alone', () => {
    const clock = TerminalClock.from(SUNB, [
      shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
      shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:59Z'),
    ]);
    expect(clock.worstDriftPpm()).toBeLessThan(DRIFT_ALARM_PPM);
    expect(clock.needsAttention()).toBe(false);
  });

  it('raises a drifting one', () => {
    const clock = TerminalClock.from(SUNB, [
      shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
      shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:30Z'),
    ]);
    expect(clock.worstDriftPpm()).toBeGreaterThan(DRIFT_ALARM_PPM);
    expect(clock.needsAttention()).toBe(true);
  });

  it('raises one that has clearly been power cycled', () => {
    const clock = TerminalClock.from(SUNB, [shake('2025-01-13T11:00:00Z', '2015-01-13T11:00:00Z')]);
    expect(clock.worstDriftPpm()).toBe(0);
    expect(clock.needsAttention()).toBe(true);
    expect(clock.worstOffsetMs()).toBeGreaterThan(0);
  });
});

describe('the book of clocks', () => {
  const book = ClockBook.from([
    shake('2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
    shake('2025-01-14T11:00:00Z', '2025-01-14T10:59:52Z'),
    shake('2025-01-13T11:00:00Z', '2025-01-13T10:59:59Z', RIDGE),
  ]);

  it('keeps one clock per terminal', () => {
    expect(book.size).toBe(2);
    expect(book.terminals()).toEqual([RIDGE, SUNB]);
    expect(book.has(SUNB)).toBe(true);
    expect(book.has(terminal('BOWL.01'))).toBe(false);
  });

  it('gives an empty clock for a terminal it has never heard from', () => {
    const clock = book.for(terminal('BOWL.01'));
    expect(clock.count).toBe(0);
    expect(clock.correct(new Date('2025-01-13T16:00:00Z')).toISOString()).toBe(
      '2025-01-13T16:00:00.000Z',
    );
  });

  it('corrects each terminal by its own offset', () => {
    expect(book.for(SUNB).correct(new Date('2025-01-14T11:00:00Z')).toISOString()).toBe(
      '2025-01-14T11:00:08.000Z',
    );
    expect(book.for(RIDGE).correct(new Date('2025-01-14T11:00:00Z')).toISOString()).toBe(
      '2025-01-14T11:00:01.000Z',
    );
  });

  it('lists the terminals worth walking up to', () => {
    const noisy = ClockBook.from([
      shake('2025-01-13T11:00:00Z', '2015-01-13T11:00:00Z'),
      shake('2025-01-13T11:00:00Z', '2025-01-13T10:59:59Z', RIDGE),
    ]);
    expect(noisy.needingAttention()).toEqual([SUNB]);
    expect(book.needingAttention()).toEqual([]);
  });
});
