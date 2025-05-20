import { operatingDay, type OperatingDate } from '../util/clock.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import type { ClockBook } from '../domain/scan/clock-skew.js';
import type { NormalisedScan } from '../domain/scan/normalise.js';
import { scanKeyOf, type ScanStore } from '../storage/repository/scans.js';

/**
 * Re-ingesting the same batch is meant to be a no-op, and for a long time it
 * was not, for a reason that took a week to find.
 *
 * A scan is stored under its terminal and sequence, so a second upload lands on
 * the same row. But the row carries the corrected time, and the correction
 * comes from the handshakes, which arrive later. Re-ingest a Christmas batch in
 * February and the clock model now knows the gate was eleven minutes out, so
 * the scan moves to a different operating day. The row is replaced correctly
 * and the old day still has it in its index, because the index was built from
 * the old value.
 *
 * The table handles the index. What nothing handled was the two days that are
 * now both wrong and need rebuilding, so this reports them.
 */

export interface DateMove {
  readonly key: string;
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly shiftMs: number;
}

export interface RestateResult {
  readonly scans: readonly NormalisedScan[];
  readonly moves: readonly DateMove[];
  readonly dirtyDates: readonly OperatingDate[];
  readonly diagnostics: DiagnosticBag;
}

/** A day whose scans moved is wrong until its rides are rebuilt. */
export function dirtyDatesOf(moves: readonly DateMove[]): OperatingDate[] {
  const dates = new Set<string>();
  for (const move of moves) {
    dates.add(move.from);
    dates.add(move.to);
  }
  return [...dates].sort() as OperatingDate[];
}

/**
 * Re-apply the current clock model to scans already on file. Nothing is written
 * unless a `store` is given, so the caller can look before it leaps.
 */
export function restateScans(
  scans: readonly NormalisedScan[],
  clocks: ClockBook,
  store?: ScanStore,
): RestateResult {
  const diagnostics = new DiagnosticBag();
  const moves: DateMove[] = [];
  const restated: NormalisedScan[] = [];

  for (const scan of scans) {
    const clock = clocks.for(scan.terminalId);
    const at = clock.correct(scan.reportedAt);
    if (at.getTime() === scan.at.getTime()) {
      restated.push(scan);
      continue;
    }
    const operatingDate = operatingDay(at);
    const next: NormalisedScan = {
      ...scan,
      at,
      correctionMs: at.getTime() - scan.reportedAt.getTime(),
      operatingDate,
    };
    restated.push(next);
    if (operatingDate !== scan.operatingDate) {
      moves.push({
        key: scanKeyOf(scan),
        from: scan.operatingDate,
        to: operatingDate,
        shiftMs: at.getTime() - scan.at.getTime(),
      });
      diagnostics.warn(
        'restate.day_moved',
        `${scanKeyOf(scan)} moved from ${scan.operatingDate} to ${operatingDate}`,
        { terminal: scan.terminalId, sequence: scan.sequence },
      );
    }
  }

  if (store !== undefined) {
    for (const scan of restated) store.scans.upsert(scan);
  }

  return { scans: restated, moves, dirtyDates: dirtyDatesOf(moves), diagnostics };
}

/** Restate everything on file, which is what a handshake backfill needs. */
export function restateStore(store: ScanStore, clocks: ClockBook): RestateResult {
  return restateScans(store.scans.all(), clocks, store);
}

export function restateDate(
  store: ScanStore,
  clocks: ClockBook,
  date: OperatingDate,
): RestateResult {
  return restateScans(store.onDate(date), clocks, store);
}
