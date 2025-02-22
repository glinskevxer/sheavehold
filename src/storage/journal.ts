import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { SheaveholdError } from '../util/diagnostic.js';
import { decodeJournal, encodeRecord, lastSequence, type JournalRecord } from './journal-format.js';

/**
 * The journal on disk. Opening one reads what is there, stops at the first
 * torn record, and remembers where the good part ended, so an append never
 * writes after rubbish. Nothing here is async: the base station does one thing
 * at a time and a synchronous append that has returned is an append that is on
 * the platter.
 */

export interface JournalOpenResult {
  readonly journal: Journal;
  readonly recovered: number;
  readonly truncatedAtLine: number | undefined;
  readonly truncateReason: string | undefined;
}

export interface AppendInput {
  readonly kind: string;
  readonly body: unknown;
  /** Defaults to now. Passed in so a replay can keep the original stamp. */
  readonly at?: Date | undefined;
}

export class Journal {
  private sequence: number;

  private constructor(
    readonly path: string,
    private readonly records: JournalRecord[],
  ) {
    this.sequence = lastSequence(records);
  }

  static open(path: string): JournalOpenResult {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) {
      writeFileSync(path, '', 'utf8');
      return {
        journal: new Journal(path, []),
        recovered: 0,
        truncatedAtLine: undefined,
        truncateReason: undefined,
      };
    }
    const text = readFileSync(path, 'utf8');
    const decoded = decodeJournal(text);
    const journal = new Journal(path, [...decoded.records]);
    if (decoded.stoppedAtLine !== undefined) {
      journal.rewriteFile();
    }
    return {
      journal,
      recovered: decoded.records.length,
      truncatedAtLine: decoded.stoppedAtLine,
      truncateReason: decoded.stopReason,
    };
  }

  private rewriteFile(): void {
    const body = this.records.map(encodeRecord).join('\n');
    const temporary = `${this.path}.rewriting`;
    writeFileSync(temporary, body === '' ? '' : `${body}\n`, 'utf8');
    renameSync(temporary, this.path);
  }

  append(input: AppendInput): JournalRecord {
    this.sequence += 1;
    const record: JournalRecord = {
      sequence: this.sequence,
      kind: input.kind,
      at: (input.at ?? new Date()).toISOString(),
      body: input.body,
    };
    appendFileSync(this.path, `${encodeRecord(record)}\n`, 'utf8');
    this.records.push(record);
    return record;
  }

  appendAll(inputs: readonly AppendInput[]): JournalRecord[] {
    return inputs.map((input) => this.append(input));
  }

  all(): readonly JournalRecord[] {
    return this.records;
  }

  since(sequence: number): JournalRecord[] {
    return this.records.filter((record) => record.sequence > sequence);
  }

  ofKind(kind: string): JournalRecord[] {
    return this.records.filter((record) => record.kind === kind);
  }

  get length(): number {
    return this.records.length;
  }

  get head(): number {
    return this.sequence;
  }

  /** Replace the file with the records held, used after a compaction. */
  replace(records: readonly JournalRecord[]): void {
    let previous = 0;
    for (const record of records) {
      if (record.sequence <= previous) {
        throw new SheaveholdError('journal.out_of_order', 'the replacement is not in order', {
          sequence: record.sequence,
        });
      }
      previous = record.sequence;
    }
    this.records.length = 0;
    this.records.push(...records);
    this.sequence = lastSequence(this.records);
    this.rewriteFile();
  }
}
