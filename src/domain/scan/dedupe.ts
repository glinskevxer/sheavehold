import type { TerminalRegistry } from '../lift/terminal.js';
import type { NormalisedScan } from './normalise.js';

/**
 * A tag sitting in the reader field gets read again and again until it walks
 * out of it, so one person going through one gate can produce five rows. The
 * gate firmware debounces some of this, badly, and the older units do not
 * debounce at all.
 *
 * The window is the terminal's own dwell plus a guard. It has to be the
 * terminal's, because the pedestal on Bowl holds a tag for eleven seconds and
 * the one on the carpet holds it for two, and a single window wide enough for
 * Bowl swallows real second rides on the carpet.
 *
 * Only accepted reads are deduped. A refusal is a person standing at the gate
 * and the queue proxy counts it, so suppressing a run of refusals would hide a
 * guest arguing with a gate for four minutes.
 */

export interface DedupeOptions {
  readonly terminals: TerminalRegistry;
  /** Added on top of the terminal dwell. Two seconds by default. */
  readonly guardSeconds?: number | undefined;
  /** Never use a window shorter than this, whatever the gate claims. */
  readonly floorSeconds?: number | undefined;
  /** Window for the same media across two gates of one maze. */
  readonly mazeSeconds?: number | undefined;
}

export type SuppressionReason = 'terminal_debounce' | 'maze_crossover';

export interface Suppression {
  readonly scan: NormalisedScan;
  readonly keptSequence: number;
  readonly gapMs: number;
  readonly reason: SuppressionReason;
}

export interface DedupeResult {
  readonly kept: readonly NormalisedScan[];
  readonly suppressed: readonly Suppression[];
}

export const DEFAULT_GUARD_SECONDS = 2;
export const DEFAULT_FLOOR_SECONDS = 5;

/**
 * How long after a read at one gate a read of the same media at a different
 * gate of the same maze is still the same person. Deliberately wider than the
 * terminal window: somebody who walks the length of a six lane maze and tries
 * the far arm takes longer than a tag sitting in one field.
 */
export const DEFAULT_MAZE_SECONDS = 45;

export function terminalWindowMs(scan: NormalisedScan, options: DedupeOptions): number {
  const guard = options.guardSeconds ?? DEFAULT_GUARD_SECONDS;
  const floor = options.floorSeconds ?? DEFAULT_FLOOR_SECONDS;
  const dwell = options.terminals.find(scan.terminalId)?.dwellSeconds ?? 0;
  return Math.max(floor, dwell + guard) * 1000;
}

/**
 * Walks the scans in time order, keeping the first read of a media at a
 * terminal and dropping the ones that follow inside the window. The window
 * runs from the kept scan, not from the previous suppressed one, so a tag that
 * sits in the field for a minute does not extend the window forever.
 */
export function dedupeByTerminal(
  scans: readonly NormalisedScan[],
  options: DedupeOptions,
): DedupeResult {
  const kept: NormalisedScan[] = [];
  const suppressed: Suppression[] = [];
  const lastKept = new Map<string, NormalisedScan>();

  for (const scan of scans) {
    if (scan.outcome !== 'accept') {
      kept.push(scan);
      continue;
    }
    const key = `${scan.terminalId}#${scan.mediaSerial}`;
    const previous = lastKept.get(key);
    if (previous !== undefined) {
      const gapMs = scan.at.getTime() - previous.at.getTime();
      if (gapMs >= 0 && gapMs < terminalWindowMs(scan, options)) {
        suppressed.push({
          scan,
          keptSequence: previous.sequence,
          gapMs,
          reason: 'terminal_debounce',
        });
        continue;
      }
    }
    lastKept.set(key, scan);
    kept.push(scan);
  }

  return { kept, suppressed };
}

/**
 * The second pass. Two gates of one maze feed the same loading point, so the
 * same media read at both inside the maze window is one person who tried the
 * wrong lane, not two rides. This runs after the terminal pass, on what that
 * pass kept, because a run of five reads at one gate would otherwise decide
 * which read the maze pass compares against.
 */
export function dedupeByMaze(
  scans: readonly NormalisedScan[],
  options: DedupeOptions,
): DedupeResult {
  const windowMs = (options.mazeSeconds ?? DEFAULT_MAZE_SECONDS) * 1000;
  const kept: NormalisedScan[] = [];
  const suppressed: Suppression[] = [];
  const lastKept = new Map<string, NormalisedScan>();

  for (const scan of scans) {
    if (scan.outcome !== 'accept') {
      kept.push(scan);
      continue;
    }
    const key = `${scan.maze}#${scan.mediaSerial}`;
    const previous = lastKept.get(key);
    if (previous !== undefined && previous.terminalId !== scan.terminalId) {
      const gapMs = scan.at.getTime() - previous.at.getTime();
      if (gapMs >= 0 && gapMs < windowMs) {
        suppressed.push({ scan, keptSequence: previous.sequence, gapMs, reason: 'maze_crossover' });
        continue;
      }
    }
    lastKept.set(key, scan);
    kept.push(scan);
  }

  return { kept, suppressed };
}

/** Both passes, in the order that matters, with the suppressions merged. */
export function dedupe(scans: readonly NormalisedScan[], options: DedupeOptions): DedupeResult {
  const first = dedupeByTerminal(scans, options);
  const second = dedupeByMaze(first.kept, options);
  return {
    kept: second.kept,
    suppressed: [...first.suppressed, ...second.suppressed].sort(
      (a, b) => a.scan.at.getTime() - b.scan.at.getTime() || a.scan.sequence - b.scan.sequence,
    ),
  };
}

export function suppressionsByReason(result: DedupeResult): Map<SuppressionReason, number> {
  const counts = new Map<SuppressionReason, number>();
  for (const entry of result.suppressed) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  return counts;
}

/** Counts per terminal, which is how a badly debouncing gate gets found. */
export function suppressionsByTerminal(result: DedupeResult): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of result.suppressed) {
    const id = entry.scan.terminalId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The share of accepted reads a gate threw away, as a rounded percentage. */
export function suppressionRate(result: DedupeResult, terminalId: string): number {
  const accepted = [...result.kept, ...result.suppressed.map((entry) => entry.scan)].filter(
    (scan) => scan.terminalId === terminalId && scan.outcome === 'accept',
  ).length;
  if (accepted === 0) return 0;
  const dropped = result.suppressed.filter((entry) => entry.scan.terminalId === terminalId).length;
  return Math.round((dropped / accepted) * 1000) / 10;
}
