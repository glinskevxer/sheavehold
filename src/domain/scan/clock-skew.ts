import type { TerminalId } from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';

/**
 * Gate terminals keep time with a cheap oscillator and no battery on the clock,
 * so a unit that has been power cycled comes back believing it is January 2015.
 * Every time a terminal reaches the base station it exchanges a handshake, and
 * that gives us a pair: what the terminal thought the time was, and what it
 * actually was.
 *
 * Between two handshakes the offset is interpolated, because the drift is
 * linear over a day to a good enough approximation. Outside the handshakes we
 * hold the nearest offset flat rather than extrapolating a slope, since an
 * extrapolated slope over a three week gap has put scans in the wrong season.
 */

export interface ClockHandshake {
  readonly terminalId: TerminalId;
  /** What the base station clock read. This one is trusted. */
  readonly serverAt: Date;
  /** What the terminal said its own clock read at the same moment. */
  readonly terminalAt: Date;
}

export interface Handshake {
  readonly serverMs: number;
  readonly offsetMs: number;
}

export function handshakeOffsetMs(handshake: ClockHandshake): number {
  return handshake.serverAt.getTime() - handshake.terminalAt.getTime();
}

/** Drift between two handshakes in parts per million of elapsed time. */
export function driftPpm(earlier: Handshake, later: Handshake): number {
  const elapsed = later.serverMs - earlier.serverMs;
  if (elapsed <= 0) return 0;
  return ((later.offsetMs - earlier.offsetMs) / elapsed) * 1_000_000;
}

/** A crystal this far out is a work order, not a correction. */
export const DRIFT_ALARM_PPM = 250;

/** Beyond this the terminal has clearly been power cycled, not drifted. */
export const OFFSET_ALARM_MS = 6 * 60 * 60 * 1000;

export class TerminalClock {
  private readonly handshakes: Handshake[] = [];

  constructor(readonly terminalId: TerminalId) {}

  static from(terminalId: TerminalId, handshakes: readonly ClockHandshake[]): TerminalClock {
    const clock = new TerminalClock(terminalId);
    for (const handshake of handshakes) clock.record(handshake);
    return clock;
  }

  record(handshake: ClockHandshake): Result<Handshake> {
    if (handshake.terminalId !== this.terminalId) {
      return err(`handshake for ${handshake.terminalId} given to ${this.terminalId}`);
    }
    if (
      Number.isNaN(handshake.serverAt.getTime()) ||
      Number.isNaN(handshake.terminalAt.getTime())
    ) {
      return err(`handshake for ${this.terminalId} carries an unreadable time`);
    }
    const entry: Handshake = {
      serverMs: handshake.serverAt.getTime(),
      offsetMs: handshakeOffsetMs(handshake),
    };
    this.handshakes.push(entry);
    this.handshakes.sort((a, b) => a.serverMs - b.serverMs);
    return ok(entry);
  }

  get count(): number {
    return this.handshakes.length;
  }

  all(): readonly Handshake[] {
    return this.handshakes;
  }

  /**
   * The offset to add to a terminal reading to get area time. Interpolated
   * between the surrounding handshakes and held flat outside them.
   */
  offsetMsAt(terminalReading: Date): number {
    if (this.handshakes.length === 0) return 0;
    const first = this.handshakes[0];
    const last = this.handshakes[this.handshakes.length - 1];
    if (first === undefined || last === undefined) return 0;

    const target = terminalReading.getTime() + first.offsetMs;
    if (target <= first.serverMs) return first.offsetMs;
    if (terminalReading.getTime() + last.offsetMs >= last.serverMs) return last.offsetMs;

    for (let i = 1; i < this.handshakes.length; i += 1) {
      const before = this.handshakes[i - 1];
      const after = this.handshakes[i];
      if (before === undefined || after === undefined) continue;
      const guess = terminalReading.getTime() + before.offsetMs;
      if (guess <= after.serverMs) {
        const span = after.serverMs - before.serverMs;
        if (span <= 0) return after.offsetMs;
        const along = Math.min(1, Math.max(0, (guess - before.serverMs) / span));
        return Math.round(before.offsetMs + (after.offsetMs - before.offsetMs) * along);
      }
    }
    return last.offsetMs;
  }

  correct(terminalReading: Date): Date {
    return new Date(terminalReading.getTime() + this.offsetMsAt(terminalReading));
  }

  /** Worst drift between any two consecutive handshakes. */
  worstDriftPpm(): number {
    let worst = 0;
    for (let i = 1; i < this.handshakes.length; i += 1) {
      const before = this.handshakes[i - 1];
      const after = this.handshakes[i];
      if (before === undefined || after === undefined) continue;
      const drift = Math.abs(driftPpm(before, after));
      if (drift > worst) worst = drift;
    }
    return Math.round(worst);
  }

  worstOffsetMs(): number {
    return this.handshakes.reduce((worst, entry) => Math.max(worst, Math.abs(entry.offsetMs)), 0);
  }

  needsAttention(): boolean {
    return this.worstDriftPpm() > DRIFT_ALARM_PPM || this.worstOffsetMs() > OFFSET_ALARM_MS;
  }
}

/** Every terminal's clock, which is what the ingest pipeline is handed. */
export class ClockBook {
  private readonly clocks = new Map<string, TerminalClock>();

  static from(handshakes: readonly ClockHandshake[]): ClockBook {
    const book = new ClockBook();
    for (const handshake of handshakes) book.record(handshake);
    return book;
  }

  record(handshake: ClockHandshake): Result<Handshake> {
    const existing =
      this.clocks.get(handshake.terminalId) ?? new TerminalClock(handshake.terminalId);
    this.clocks.set(handshake.terminalId, existing);
    return existing.record(handshake);
  }

  /** A terminal with no handshake at all corrects by nothing, and says so. */
  for(terminalId: TerminalId): TerminalClock {
    return this.clocks.get(terminalId) ?? new TerminalClock(terminalId);
  }

  has(terminalId: TerminalId): boolean {
    return this.clocks.has(terminalId);
  }

  get size(): number {
    return this.clocks.size;
  }

  terminals(): TerminalId[] {
    return [...this.clocks.keys()].sort() as TerminalId[];
  }

  needingAttention(): TerminalId[] {
    return this.terminals().filter((id) => this.for(id).needsAttention());
  }
}
