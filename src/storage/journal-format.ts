import { err, ok, type Result } from '../util/result.js';

/**
 * The base station is a fanless box in an unheated room and it loses power
 * several times a season, usually in the middle of an upload. So the journal is
 * append only and every record carries its own length and checksum. A record
 * that was half written when the lights went out fails its checksum and the
 * reader stops there rather than trying to interpret it.
 *
 * One line per record so the file can be read with ordinary tools when
 * somebody is standing in the room with a laptop. The format is
 *
 *     <sequence> <crc32> <length> <json>
 *
 * with single spaces, and the json is guaranteed to hold no newline.
 */

export interface JournalRecord {
  readonly sequence: number;
  readonly kind: string;
  readonly at: string;
  readonly body: unknown;
}

const LINE = /^(\d+) ([0-9a-f]{8}) (\d+) (.*)$/;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(text: string): string {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i += 1) {
    const byte = text.charCodeAt(i) & 0xff;
    const index = (crc ^ byte) & 0xff;
    crc = ((crc >>> 8) ^ (CRC_TABLE[index] ?? 0)) >>> 0;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

export function encodeRecord(record: JournalRecord): string {
  if (!Number.isInteger(record.sequence) || record.sequence < 1) {
    throw new Error(`a journal record needs a positive sequence, got ${record.sequence}`);
  }
  if (record.kind.trim() === '' || /\s/.test(record.kind)) {
    throw new Error(`a journal kind cannot hold whitespace, got ${JSON.stringify(record.kind)}`);
  }
  const payload = JSON.stringify({ kind: record.kind, at: record.at, body: record.body });
  return `${record.sequence} ${crc32(payload)} ${payload.length} ${payload}`;
}

export function decodeRecord(line: string): Result<JournalRecord> {
  const match = LINE.exec(line);
  if (match === null) return err('the line is not a journal record');
  const [, sequenceText, checksum, lengthText, payload] = match;
  if (sequenceText === undefined || checksum === undefined || lengthText === undefined) {
    return err('the line is not a journal record');
  }
  const body = payload ?? '';
  if (body.length !== Number(lengthText)) {
    return err(`record ${sequenceText} claims ${lengthText} bytes and carries ${body.length}`);
  }
  if (crc32(body) !== checksum) {
    return err(`record ${sequenceText} fails its checksum`);
  }
  let parsed: { kind?: unknown; at?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return err(`record ${sequenceText} is not json`);
  }
  if (typeof parsed.kind !== 'string' || parsed.kind === '') {
    return err(`record ${sequenceText} has no kind`);
  }
  if (typeof parsed.at !== 'string') {
    return err(`record ${sequenceText} has no timestamp`);
  }
  return ok({
    sequence: Number(sequenceText),
    kind: parsed.kind,
    at: parsed.at,
    body: parsed.body,
  });
}

export interface DecodedJournal {
  readonly records: readonly JournalRecord[];
  /** The line the reader stopped at, if it stopped early. */
  readonly stoppedAtLine: number | undefined;
  readonly stopReason: string | undefined;
}

/**
 * Stops at the first record that does not decode, keeping everything before
 * it. A torn tail is normal after a power cut and is not an error.
 */
export function decodeJournal(text: string): DecodedJournal {
  const records: JournalRecord[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === '') continue;
    const decoded = decodeRecord(line);
    if (!decoded.ok) {
      return { records, stoppedAtLine: i + 1, stopReason: decoded.error };
    }
    const previous = records[records.length - 1];
    if (previous !== undefined && decoded.value.sequence <= previous.sequence) {
      return {
        records,
        stoppedAtLine: i + 1,
        stopReason: `record ${decoded.value.sequence} does not follow ${previous.sequence}`,
      };
    }
    records.push(decoded.value);
  }
  return { records, stoppedAtLine: undefined, stopReason: undefined };
}

export function lastSequence(records: readonly JournalRecord[]): number {
  return records[records.length - 1]?.sequence ?? 0;
}
