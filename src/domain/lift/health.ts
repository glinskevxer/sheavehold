import { operatingDayBounds, type OperatingDate } from '../../util/clock.js';
import { groupBy } from '../../util/collect.js';
import type { TerminalId } from '../../util/ids.js';
import type { NormalisedScan } from '../scan/normalise.js';
import type { Terminal, TerminalRegistry } from './terminal.js';

/**
 * A gate that has stopped reading looks exactly like a gate nobody walked
 * through, and the difference matters: one is a work order and the other is a
 * quiet Tuesday. The only way to tell from the data is the shape of the gaps.
 *
 * A live gate reads irregularly but never goes silent for hours in the middle
 * of a busy day while the gate next to it keeps counting. That comparison is
 * what this does.
 */

export interface HealthReading {
  readonly terminal: TerminalId;
  readonly maze: string;
  readonly scans: number;
  readonly firstAt: Date | undefined;
  readonly lastAt: Date | undefined;
  /** Longest stretch with no read at all, in minutes. */
  readonly longestGapMinutes: number;
  /** Reads at the edge of the field, the first sign of a failing antenna. */
  readonly weakReads: number;
  readonly weakShare: number;
  readonly silent: boolean;
  readonly suspect: boolean;
}

/** A gap longer than this on a day the maze was busy is worth walking up to. */
export const SUSPECT_GAP_MINUTES = 90;

/** Above this share of weak reads the antenna is failing, not the guests. */
export const SUSPECT_WEAK_SHARE = 25;

function longestGap(scans: readonly NormalisedScan[], date: OperatingDate): number {
  if (scans.length === 0) return 0;
  const { start } = operatingDayBounds(date);
  const ordered = [...scans].sort((a, b) => a.at.getTime() - b.at.getTime());
  let previous = ordered[0]?.at.getTime() ?? start.getTime();
  let worst = 0;
  for (const scan of ordered) {
    worst = Math.max(worst, (scan.at.getTime() - previous) / 60_000);
    previous = scan.at.getTime();
  }
  return Math.round(worst);
}

export function readHealth(
  terminal: Terminal,
  scans: readonly NormalisedScan[],
  date: OperatingDate,
): HealthReading {
  const own = scans.filter((scan) => scan.terminalId === terminal.id);
  const ordered = [...own].sort((a, b) => a.at.getTime() - b.at.getTime());
  const weak = own.filter((scan) => scan.weakRead).length;
  const weakShare = own.length === 0 ? 0 : Math.round((weak / own.length) * 1000) / 10;
  const gap = longestGap(own, date);

  return {
    terminal: terminal.id,
    maze: terminal.maze,
    scans: own.length,
    firstAt: ordered[0]?.at,
    lastAt: ordered.at(-1)?.at,
    longestGapMinutes: gap,
    weakReads: weak,
    weakShare,
    silent: own.length === 0,
    suspect: gap >= SUSPECT_GAP_MINUTES || weakShare >= SUSPECT_WEAK_SHARE,
  };
}

export interface HealthReport {
  readonly date: OperatingDate;
  readonly readings: readonly HealthReading[];
  /** Gates that read nothing while another gate in their maze was busy. */
  readonly silentInBusyMaze: readonly TerminalId[];
  readonly suspect: readonly TerminalId[];
}

export function terminalHealth(
  terminals: TerminalRegistry,
  scans: readonly NormalisedScan[],
  date: OperatingDate,
): HealthReport {
  const readings = terminals
    .live()
    .map((terminal) => readHealth(terminal, scans, date))
    .sort(
      (a, b) => b.longestGapMinutes - a.longestGapMinutes || a.terminal.localeCompare(b.terminal),
    );

  const silentInBusyMaze: TerminalId[] = [];
  for (const own of groupBy(readings, (reading) => reading.maze).values()) {
    if (!own.some((reading) => reading.scans > 0)) continue;
    for (const reading of own) {
      if (reading.silent) silentInBusyMaze.push(reading.terminal);
    }
  }

  const suspect = readings
    .filter((reading) => reading.suspect)
    .map((reading) => reading.terminal)
    .sort();

  return { date, readings, silentInBusyMaze: silentInBusyMaze.sort(), suspect };
}
