import { z } from 'zod';
import {
  parseMediaSerial,
  parseTerminalId,
  type MediaSerial,
  type TerminalId,
} from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';

/**
 * What a gate actually sends. Two things about this shape are worth stating
 * plainly, because everything downstream is built around them.
 *
 * `reportedAt` is on the terminal's own clock. It is not area time and it is
 * not UTC. Until the offset has been applied it must not be compared against
 * anything from another terminal.
 *
 * `sequence` is a per terminal counter that survives a reboot. It is the only
 * thing that tells us whether a batch has a hole in it, so it is carried all
 * the way through rather than dropped after the envelope check.
 */

export type ScanOutcome = 'accept' | 'reject';

export interface RawScan {
  readonly terminalId: TerminalId;
  readonly mediaSerial: MediaSerial;
  /** The terminal's own clock reading, as an instant. */
  readonly reportedAt: Date;
  /** Monotonic per terminal, one based, never reset. */
  readonly sequence: number;
  readonly outcome: ScanOutcome;
  /** The gate's own reason, which we do not trust but do record. */
  readonly gateReason: string;
  /** Signal strength in dBm, negative. Weak reads are worth knowing about. */
  readonly rssi: number;
  /** Which antenna in the pedestal saw it, one or two. */
  readonly antenna: number;
}

export const rawScanSchema = z.object({
  terminal: z.string().min(1),
  media: z.string().min(1),
  at: z.string().min(1),
  seq: z.number().int().nonnegative(),
  outcome: z.enum(['accept', 'reject']),
  reason: z.string().default(''),
  rssi: z.number(),
  antenna: z.number().int().min(1).max(2),
});

export type RawScanRow = z.infer<typeof rawScanSchema>;

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * The 2019 firmware writes `2025-01-13 09:14:07` with no zone at all and means
 * the terminal's own clock, so a bare stamp is read as UTC and corrected later.
 * Anything with a zone on it is taken at its word.
 */
export function parseReportedAt(raw: string): Result<Date> {
  const trimmed = raw.trim();
  if (!ISO_LIKE.test(trimmed)) return err(`timestamp ${JSON.stringify(raw)} is not readable`);
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalised = trimmed.replace(' ', 'T');
  const value = new Date(zoned ? normalised : `${normalised}Z`);
  if (Number.isNaN(value.getTime())) return err(`timestamp ${JSON.stringify(raw)} is not a date`);
  return ok(value);
}

export function makeRawScan(row: RawScanRow): Result<RawScan> {
  const terminalId = parseTerminalId(row.terminal);
  if (!terminalId.ok) return terminalId;
  const mediaSerial = parseMediaSerial(row.media);
  if (!mediaSerial.ok) return mediaSerial;
  const reportedAt = parseReportedAt(row.at);
  if (!reportedAt.ok) return reportedAt;
  if (row.rssi > 0 || row.rssi < -100) return err(`rssi ${row.rssi} is outside the readable band`);
  return ok({
    terminalId: terminalId.value,
    mediaSerial: mediaSerial.value,
    reportedAt: reportedAt.value,
    sequence: row.seq,
    outcome: row.outcome,
    gateReason: row.reason.trim(),
    rssi: row.rssi,
    antenna: row.antenna,
  });
}

/** Parse straight off a json object, collecting the schema complaint. */
export function readRawScan(value: unknown): Result<RawScan> {
  const parsed = rawScanSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? 'row' : first.path.join('.');
    const why = first === undefined ? 'is not a scan' : first.message;
    return err(`${where === '' ? 'row' : where}: ${why}`);
  }
  return makeRawScan(parsed.data);
}

export function scanKey(scan: RawScan): string {
  return `${scan.terminalId}#${scan.sequence}`;
}

/** A read below this is worth a warning: the tag was at the edge of the field. */
export const WEAK_RSSI_DBM = -68;

export function isWeakRead(scan: RawScan): boolean {
  return scan.rssi < WEAK_RSSI_DBM;
}
