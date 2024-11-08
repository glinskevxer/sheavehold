import { parseCsvTable } from '../util/csv.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import { parsePrintedId, type MediaSerial, type PrintedId } from '../util/ids.js';
import { err, ok, type Result } from '../util/result.js';
import { makeRawScan, type RawScan } from '../domain/scan/scan.js';

/**
 * The 2019 controllers on Bowl and the Poma are never being replaced, so their
 * export stays supported. It is a semicolon separated file with the columns in
 * the wrong order, a bare local timestamp, and the printed card number instead
 * of the tag epc, which means the reader cannot work without a lookup.
 *
 * That lookup is the interesting part. A printed number is reused when a card
 * is reissued, so resolving it needs the moment of the scan, and the moment of
 * the scan is on the terminal clock and has not been corrected yet. We resolve
 * on the reported time and accept that a card reissued inside the drift window
 * can land on the wrong holder. The exception register catches those.
 */

export type PrintedIdResolver = (printed: PrintedId, at: Date) => MediaSerial | undefined;

const REQUIRED = ['GATE', 'CARDNO', 'STAMP', 'CNT', 'RES', 'DBM'] as const;

const OUTCOMES: Readonly<Record<string, 'accept' | 'reject'>> = {
  OK: 'accept',
  PASS: 'accept',
  NOK: 'reject',
  DENY: 'reject',
  BLOCK: 'reject',
};

export interface LegacyReadResult {
  readonly scans: readonly RawScan[];
  readonly diagnostics: DiagnosticBag;
}

export interface LegacyOptions {
  readonly resolve: PrintedIdResolver;
  readonly file?: string | undefined;
  readonly delimiter?: string | undefined;
}

export function readLegacyExport(text: string, options: LegacyOptions): Result<LegacyReadResult> {
  const table = parseCsvTable(text, { delimiter: options.delimiter ?? ';' });
  if (!table.ok) return table;
  const missing = REQUIRED.filter((name) => !table.value.header.includes(name));
  if (missing.length > 0) return err(`the export is missing ${missing.join(', ')}`);

  const diagnostics = new DiagnosticBag();
  const scans: RawScan[] = [];

  for (const record of table.value.records) {
    const where = { file: options.file, line: record.line };
    const printed = parsePrintedId(record.values.CARDNO ?? '');
    if (!printed.ok) {
      diagnostics.error('legacy.bad_card', printed.error, {}, where);
      continue;
    }
    const stamp = (record.values.STAMP ?? '').trim();
    const at = new Date(`${stamp.replace(' ', 'T')}Z`);
    if (Number.isNaN(at.getTime())) {
      diagnostics.error(
        'legacy.bad_stamp',
        `stamp ${JSON.stringify(stamp)} is unreadable`,
        {},
        where,
      );
      continue;
    }
    const serial = options.resolve(printed.value, at);
    if (serial === undefined) {
      diagnostics.error(
        'legacy.unresolved_card',
        `card ${printed.value} is not bound at ${stamp}`,
        { card: printed.value },
        where,
      );
      continue;
    }
    const code = (record.values.RES ?? '').trim().toUpperCase();
    const outcome = OUTCOMES[code];
    if (outcome === undefined) {
      diagnostics.error(
        'legacy.bad_result',
        `result code ${JSON.stringify(code)} is unknown`,
        {},
        where,
      );
      continue;
    }
    const scan = makeRawScan({
      terminal: record.values.GATE ?? '',
      media: serial,
      at: at.toISOString(),
      seq: Number(record.values.CNT ?? Number.NaN),
      outcome,
      reason: code === 'OK' || code === 'PASS' ? '' : code.toLowerCase(),
      rssi: Number(record.values.DBM ?? Number.NaN),
      antenna: 1,
    });
    if (!scan.ok) {
      diagnostics.error('legacy.unreadable_row', scan.error, {}, where);
      continue;
    }
    scans.push(scan.value);
  }

  if (diagnostics.hasErrors()) {
    diagnostics.warn(
      'legacy.partial',
      `${diagnostics.bySeverity('error').length} rows dropped`,
      {},
      {
        file: options.file,
      },
    );
  }
  return ok({ scans, diagnostics });
}

/** Build a resolver from a flat table, which is what the store hands over. */
export function resolverFrom(
  entries: readonly {
    printed: PrintedId;
    serial: MediaSerial;
    from: Date;
    until?: Date | undefined;
  }[],
): PrintedIdResolver {
  const byPrinted = new Map<string, typeof entries>();
  for (const entry of entries) {
    byPrinted.set(entry.printed, [...(byPrinted.get(entry.printed) ?? []), entry]);
  }
  return (printed, at) => {
    const candidates = byPrinted.get(printed) ?? [];
    for (const entry of candidates) {
      if (at.getTime() < entry.from.getTime()) continue;
      if (entry.until !== undefined && at.getTime() >= entry.until.getTime()) continue;
      return entry.serial;
    }
    return undefined;
  };
}
