import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import { readRawScan, type RawScan } from '../domain/scan/scan.js';
import { envelopeSchema, makeEnvelope, type UploadEnvelope } from './envelope.js';

/**
 * The upload format the current firmware writes. One json object per line, the
 * envelope first and the rows after it. Newline delimited rather than one big
 * array because the gate streams it out as it reads its own flash and cannot
 * hold the whole batch in memory to close a bracket.
 *
 * A line the reader cannot make sense of is dropped with a complaint. The
 * envelope is different: if that line is unreadable there is nothing to check
 * the rest against, so the whole file is refused.
 */

export interface UploadFile {
  readonly envelope: UploadEnvelope;
  readonly scans: readonly RawScan[];
  readonly diagnostics: DiagnosticBag;
}

export interface ReadOptions {
  readonly file?: string | undefined;
  /** Stop after this many bad rows. Zero means never stop. */
  readonly maxErrors?: number | undefined;
}

interface NumberedLine {
  readonly line: number;
  readonly text: string;
}

function usefulLines(text: string): NumberedLine[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: NumberedLine[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const trimmed = raw.replace(/\r$/, '').trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    out.push({ line: i + 1, text: trimmed });
  }
  return out;
}

function parseJsonLine(line: NumberedLine): Result<unknown> {
  try {
    return ok(JSON.parse(line.text));
  } catch {
    return err(`line ${line.line} is not json`);
  }
}

export function readUploadFile(text: string, options: ReadOptions = {}): Result<UploadFile> {
  const diagnostics = new DiagnosticBag();
  const lines = usefulLines(text);
  const head = lines[0];
  if (head === undefined) return err('the upload has no envelope line');

  const headJson = parseJsonLine(head);
  if (!headJson.ok) return err(`the envelope line is not json`);
  const headParsed = envelopeSchema.safeParse(headJson.value);
  if (!headParsed.success) {
    const issue = headParsed.error.issues[0];
    return err(`the envelope is missing ${issue?.path.join('.') ?? 'a field'}`);
  }
  const envelope = makeEnvelope(headParsed.data);
  if (!envelope.ok) return envelope;

  const source = { batch: envelope.value.batchId, file: options.file };
  const scans: RawScan[] = [];
  let errors = 0;
  const limit = options.maxErrors ?? 0;

  for (const line of lines.slice(1)) {
    const json = parseJsonLine(line);
    if (!json.ok) {
      errors += 1;
      diagnostics.error('row.not_json', json.error, {}, { ...source, line: line.line });
      if (limit > 0 && errors >= limit) break;
      continue;
    }
    const scan = readRawScan(json.value);
    if (!scan.ok) {
      errors += 1;
      diagnostics.error('row.unreadable', scan.error, {}, { ...source, line: line.line });
      if (limit > 0 && errors >= limit) break;
      continue;
    }
    scans.push(scan.value);
  }

  if (errors > 0) {
    diagnostics.warn('batch.partial', `${errors} rows were dropped`, { dropped: errors }, source);
  }
  return ok({ envelope: envelope.value, scans, diagnostics });
}

/** Write the same shape back out, which the replay command needs. */
export function writeUploadFile(envelope: UploadEnvelope, scans: readonly RawScan[]): string {
  const head = {
    batch: envelope.batchId,
    terminal: envelope.terminalId,
    uploaded: envelope.uploadedAt.toISOString(),
    first: envelope.firstSequence,
    last: envelope.lastSequence,
    rows: envelope.rowCount,
    checksum: envelope.checksum,
    firmware: envelope.firmware,
  };
  const body = scans.map((scan) => ({
    terminal: scan.terminalId,
    media: scan.mediaSerial,
    at: scan.reportedAt.toISOString(),
    seq: scan.sequence,
    outcome: scan.outcome,
    reason: scan.gateReason,
    rssi: scan.rssi,
    antenna: scan.antenna,
  }));
  return [head, ...body].map((row) => JSON.stringify(row)).join('\n');
}
