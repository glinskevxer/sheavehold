import { operatingDay, type OperatingDate } from '../../util/clock.js';
import type { DiagnosticBag } from '../../util/diagnostic.js';
import {
  liftOfTerminal,
  type LiftCode,
  type MediaSerial,
  type TerminalId,
} from '../../util/ids.js';
import type { TerminalRegistry } from '../lift/terminal.js';
import type { ClockBook } from './clock-skew.js';
import { isWeakRead, type RawScan, type ScanOutcome } from './scan.js';

/**
 * Normalisation is the seam where a pile of terminal readings becomes a stream
 * of events on one timeline. After this stage nothing downstream ever looks at
 * `reportedAt` again, and everything downstream can compare two scans from two
 * different gates without thinking about it.
 *
 * The correction is recorded on every scan rather than thrown away, because the
 * exception register has to be able to answer "was this pass-back real or was
 * it a gate that had lost eleven minutes".
 */

export interface NormalisedScan {
  readonly terminalId: TerminalId;
  readonly lift: LiftCode;
  readonly maze: string;
  readonly mediaSerial: MediaSerial;
  /** Area timeline. This is the only time anything downstream reads. */
  readonly at: Date;
  readonly reportedAt: Date;
  readonly correctionMs: number;
  readonly operatingDate: OperatingDate;
  readonly sequence: number;
  readonly outcome: ScanOutcome;
  readonly gateReason: string;
  readonly rssi: number;
  readonly weakRead: boolean;
}

/** A correction past this is worth a note on the day, not just in the record. */
export const LARGE_CORRECTION_MS = 90_000;

export interface NormaliseOptions {
  readonly clocks: ClockBook;
  readonly terminals: TerminalRegistry;
  readonly diagnostics?: DiagnosticBag | undefined;
  /** Batch label carried onto every complaint this stage raises. */
  readonly batch?: string | undefined;
}

export function normaliseScan(
  scan: RawScan,
  options: NormaliseOptions,
): NormalisedScan | undefined {
  const bag = options.diagnostics;
  const source = options.batch === undefined ? undefined : { batch: options.batch };
  const terminal = options.terminals.find(scan.terminalId);
  if (terminal === undefined) {
    bag?.error(
      'scan.unknown_terminal',
      `no terminal ${scan.terminalId} on file`,
      {
        terminal: scan.terminalId,
        sequence: scan.sequence,
      },
      source,
    );
    return undefined;
  }
  if (terminal.status === 'removed') {
    bag?.warn(
      'scan.removed_terminal',
      `terminal ${scan.terminalId} was taken out of service`,
      {
        terminal: scan.terminalId,
      },
      source,
    );
  }

  const clock = options.clocks.for(scan.terminalId);
  const at = clock.correct(scan.reportedAt);
  const correctionMs = at.getTime() - scan.reportedAt.getTime();
  if (Math.abs(correctionMs) >= LARGE_CORRECTION_MS) {
    bag?.warn(
      'scan.large_correction',
      `terminal ${scan.terminalId} was out by ${Math.round(correctionMs / 1000)}s`,
      {
        terminal: scan.terminalId,
        correctionMs,
      },
      source,
    );
  }

  const weakRead = isWeakRead(scan);
  if (weakRead) {
    bag?.info(
      'scan.weak_read',
      `read at ${scan.rssi} dBm on ${scan.terminalId}`,
      {
        terminal: scan.terminalId,
        rssi: scan.rssi,
      },
      source,
    );
  }

  return {
    terminalId: scan.terminalId,
    lift: liftOfTerminal(scan.terminalId),
    maze: terminal.maze,
    mediaSerial: scan.mediaSerial,
    at,
    reportedAt: scan.reportedAt,
    correctionMs,
    operatingDate: operatingDay(at),
    sequence: scan.sequence,
    outcome: scan.outcome,
    gateReason: scan.gateReason,
    rssi: scan.rssi,
    weakRead,
  };
}

export function compareScans(left: NormalisedScan, right: NormalisedScan): number {
  return (
    left.at.getTime() - right.at.getTime() ||
    left.terminalId.localeCompare(right.terminalId) ||
    left.sequence - right.sequence
  );
}

/**
 * Correct a whole batch and hand back one timeline. Rows whose terminal is not
 * on file are dropped rather than guessed at, and the count of what was dropped
 * goes on the batch receipt.
 */
export function normaliseScans(
  scans: readonly RawScan[],
  options: NormaliseOptions,
): NormalisedScan[] {
  const out: NormalisedScan[] = [];
  for (const scan of scans) {
    const normalised = normaliseScan(scan, options);
    if (normalised !== undefined) out.push(normalised);
  }
  out.sort(compareScans);
  return out;
}

export interface SequenceGap {
  readonly terminalId: TerminalId;
  readonly after: number;
  readonly before: number;
  readonly missing: number;
}

/**
 * Holes in a terminal's sequence, which mean rows we have never seen. A hole is
 * not an error on its own: the missing rows are usually in a batch that has not
 * been uploaded yet. It becomes an error when the day is closed.
 */
export function sequenceGaps(scans: readonly NormalisedScan[]): SequenceGap[] {
  const byTerminal = new Map<string, number[]>();
  for (const scan of scans) {
    const list = byTerminal.get(scan.terminalId) ?? [];
    list.push(scan.sequence);
    byTerminal.set(scan.terminalId, list);
  }
  const gaps: SequenceGap[] = [];
  for (const [terminalId, sequences] of byTerminal) {
    const sorted = [...new Set(sequences)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const before = sorted[i - 1];
      const after = sorted[i];
      if (before === undefined || after === undefined) continue;
      if (after - before > 1) {
        gaps.push({
          terminalId: terminalId as TerminalId,
          after: before,
          before: after,
          missing: after - before - 1,
        });
      }
    }
  }
  return gaps.sort((a, b) => a.terminalId.localeCompare(b.terminalId) || a.after - b.after);
}

/** Rows the same terminal sent twice under one sequence number. */
export function duplicateSequences(scans: readonly NormalisedScan[]): NormalisedScan[] {
  const seen = new Map<string, NormalisedScan>();
  const repeats: NormalisedScan[] = [];
  for (const scan of scans) {
    const key = `${scan.terminalId}#${scan.sequence}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, scan);
      continue;
    }
    repeats.push(scan);
  }
  return repeats;
}

export function scansOnDate(
  scans: readonly NormalisedScan[],
  date: OperatingDate,
): NormalisedScan[] {
  return scans.filter((scan) => scan.operatingDate === date);
}
