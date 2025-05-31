import type { OperatingDate } from '../../util/clock.js';
import { groupBy, tallyBy } from '../../util/collect.js';
import { err, ok, type Result } from '../../util/result.js';
import type { PassbackFinding } from './passback.js';
import type { TransferFinding } from './transfer.js';

/**
 * The register is a work queue for a supervisor. Everything in it is a claim
 * the software is making about a guest, and every one of those claims can be
 * wrong, so nothing here is ever acted on automatically.
 *
 * The identity of an exception is the thing it is about, not when it was found.
 * A pass-back between the same two rides is the same exception however many
 * times the day is recomputed, which is what stops a supervisor being shown
 * something they already dismissed.
 */

export type ExceptionKind =
  | 'passback_same_lift'
  | 'impossible_transfer'
  | 'unknown_media'
  | 'retired_media'
  | 'voided_pass'
  | 'gate_disagreement';

export type Disposition = 'open' | 'confirmed' | 'dismissed' | 'referred';

export interface ExceptionRow {
  readonly id: string;
  readonly kind: ExceptionKind;
  readonly operatingDate: OperatingDate;
  /** The media or the pass the finding is about. */
  readonly subject: string;
  readonly detail: string;
  readonly evidence: readonly string[];
  readonly severity: 'low' | 'medium' | 'high';
  readonly disposition: Disposition;
  readonly note: string;
  readonly decidedBy: string | undefined;
  readonly decidedAt: Date | undefined;
}

const DISPOSITIONS: readonly Disposition[] = ['open', 'confirmed', 'dismissed', 'referred'];

export function isDisposition(value: string): value is Disposition {
  return (DISPOSITIONS as readonly string[]).includes(value);
}

/** Stable across recomputes: kind, day, subject and the rides involved. */
export function exceptionKey(
  kind: ExceptionKind,
  date: OperatingDate,
  subject: string,
  evidence: readonly string[],
): string {
  return [kind, date, subject, ...[...evidence].sort()].join('|');
}

export function fromPassback(finding: PassbackFinding, date: OperatingDate): ExceptionRow {
  const evidence = [finding.firstRideId, finding.secondRideId];
  return {
    id: exceptionKey('passback_same_lift', date, finding.mediaSerial, evidence),
    kind: 'passback_same_lift',
    operatingDate: date,
    subject: finding.mediaSerial,
    detail: `boarded ${finding.lift} twice ${finding.gapMinutes} minutes apart, minimum lap is ${finding.minimumLapMinutes}`,
    evidence,
    severity:
      finding.confidence === 'certain'
        ? 'high'
        : finding.confidence === 'likely'
          ? 'medium'
          : 'low',
    disposition: 'open',
    note: '',
    decidedBy: undefined,
    decidedAt: undefined,
  };
}

export function fromTransfer(finding: TransferFinding, date: OperatingDate): ExceptionRow {
  const evidence = [finding.firstRideId, finding.secondRideId];
  return {
    id: exceptionKey('impossible_transfer', date, finding.mediaSerial, evidence),
    kind: 'impossible_transfer',
    operatingDate: date,
    subject: finding.mediaSerial,
    detail: `${finding.fromLift} to ${finding.toLift} in ${finding.gapMinutes} minutes, needs ${finding.requiredMinutes}`,
    evidence,
    severity: finding.shortfallMinutes >= 10 ? 'high' : 'medium',
    disposition: 'open',
    note: '',
    decidedBy: undefined,
    decidedAt: undefined,
  };
}

export interface DecisionInput {
  readonly disposition: Disposition;
  readonly note?: string | undefined;
  readonly by: string;
  readonly at: Date;
}

/**
 * Holds the rows and, more importantly, holds the decisions. A recompute hands
 * it a fresh set of findings and it keeps whatever a person already said about
 * the ones it recognises.
 */
export class ExceptionRegister {
  private readonly rows = new Map<string, ExceptionRow>();

  static from(rows: readonly ExceptionRow[]): ExceptionRegister {
    const register = new ExceptionRegister();
    for (const row of rows) register.rows.set(row.id, row);
    return register;
  }

  get size(): number {
    return this.rows.size;
  }

  get(id: string): ExceptionRow | undefined {
    return this.rows.get(id);
  }

  all(): ExceptionRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.operatingDate.localeCompare(b.operatingDate) || a.id.localeCompare(b.id),
    );
  }

  /**
   * Take a fresh set of findings for a day. Rows already decided keep their
   * decision, rows nobody has looked at are replaced, and rows that no longer
   * appear are dropped unless somebody has been in them.
   */
  reconcile(
    date: OperatingDate,
    findings: readonly ExceptionRow[],
  ): {
    added: number;
    kept: number;
    dropped: number;
  } {
    const incoming = new Map(findings.map((row) => [row.id, row]));
    let added = 0;
    let kept = 0;
    let dropped = 0;

    for (const existing of this.all()) {
      if (existing.operatingDate !== date) continue;
      if (incoming.has(existing.id)) {
        kept += 1;
        continue;
      }
      if (existing.disposition === 'open') {
        this.rows.delete(existing.id);
        dropped += 1;
      }
    }

    for (const [id, row] of incoming) {
      const existing = this.rows.get(id);
      if (existing !== undefined) continue;
      this.rows.set(id, row);
      added += 1;
    }

    return { added, kept, dropped };
  }

  decide(id: string, decision: DecisionInput): Result<ExceptionRow> {
    const row = this.rows.get(id);
    if (row === undefined) return err(`no exception ${id}`);
    if (decision.by.trim() === '') return err('a decision needs somebody to make it');
    const next: ExceptionRow = {
      ...row,
      disposition: decision.disposition,
      note: decision.note?.trim() ?? row.note,
      decidedBy: decision.by.trim(),
      decidedAt: decision.at,
    };
    this.rows.set(id, next);
    return ok(next);
  }

  open(): ExceptionRow[] {
    return this.all().filter((row) => row.disposition === 'open');
  }

  onDate(date: OperatingDate): ExceptionRow[] {
    return this.all().filter((row) => row.operatingDate === date);
  }

  ofSubject(subject: string): ExceptionRow[] {
    return this.all().filter((row) => row.subject === subject);
  }

  byKind(): Map<ExceptionKind, number> {
    return tallyBy(this.all(), (row) => row.kind);
  }

  byDisposition(): Map<Disposition, number> {
    return tallyBy(this.all(), (row) => row.disposition);
  }

  /** Subjects with more than one confirmed finding, which is a real problem. */
  repeatSubjects(): string[] {
    const confirmed = this.all().filter((row) => row.disposition === 'confirmed');
    return [...groupBy(confirmed, (row) => row.subject)]
      .filter(([, rows]) => rows.length > 1)
      .map(([subject]) => subject)
      .sort();
  }
}
