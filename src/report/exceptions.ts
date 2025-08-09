import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { tallyBy } from '../util/collect.js';
import { truncate, type Column } from '../util/table.js';
import { renderDocument, tableSection, type ReportDocument } from './writer.js';
import type {
  Disposition,
  ExceptionKind,
  ExceptionRegister,
  ExceptionRow,
} from '../domain/exception/register.js';

/**
 * The register printed for a supervisor to walk through. It is sorted oldest
 * first on purpose: a finding nobody has looked at for a week is worse than a
 * serious one from this morning, because the guest has gone home.
 */

export interface ExceptionReport {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly rows: readonly ExceptionRow[];
  readonly byKind: ReadonlyMap<ExceptionKind, number>;
  readonly byDisposition: ReadonlyMap<Disposition, number>;
  readonly repeatSubjects: readonly string[];
  readonly openCount: number;
  readonly staleCount: number;
}

/** Open for longer than this and it is not worth chasing the guest. */
export const STALE_AFTER_DAYS = 7;

export function buildExceptionReport(
  from: OperatingDate,
  to: OperatingDate,
  register: ExceptionRegister,
  asOf: OperatingDate,
): ExceptionReport {
  const dates = new Set<string>(operatingDateRange(from, to));
  const rows = register.all().filter((row) => dates.has(row.operatingDate));
  const open = rows.filter((row) => row.disposition === 'open');
  const staleDates = new Set<string>(operatingDateRange(from, asOf).slice(0, -STALE_AFTER_DAYS));

  return {
    from,
    to,
    rows,
    byKind: tallyBy(rows, (row) => row.kind),
    byDisposition: tallyBy(rows, (row) => row.disposition),
    repeatSubjects: register.repeatSubjects(),
    openCount: open.length,
    staleCount: open.filter((row) => staleDates.has(row.operatingDate)).length,
  };
}

/** Widths are chosen so the whole line fits the printer without truncation. */
const columns: Column<ExceptionRow>[] = [
  { header: 'date', value: (row) => row.operatingDate },
  { header: 'kind', maxWidth: 14, value: (row) => row.kind },
  { header: 'sev', value: (row) => row.severity },
  { header: 'subject', maxWidth: 12, value: (row) => truncate(row.subject, 12) },
  { header: 'detail', maxWidth: 22, value: (row) => row.detail },
  { header: 'state', maxWidth: 9, value: (row) => row.disposition },
  { header: 'by', maxWidth: 8, value: (row) => row.decidedBy ?? '' },
];

export function exceptionDocument(report: ExceptionReport): ReportDocument {
  const footer =
    report.repeatSubjects.length === 0
      ? []
      : [`confirmed more than once: ${report.repeatSubjects.join(', ')}`];
  return {
    title: `exception register  ${report.from} to ${report.to}`,
    subtitle: `${report.openCount} open, ${report.staleCount} of those older than ${STALE_AFTER_DAYS} days`,
    sections: [tableSection(report.rows, columns, { emptyNote: 'nothing to look at' })],
    footer,
  };
}

export function renderExceptionReport(report: ExceptionReport): string[] {
  return renderDocument(exceptionDocument(report));
}

/** What the morning sheet prints in one line. */
export function exceptionHeadline(report: ExceptionReport): string {
  if (report.openCount === 0) return 'no open exceptions';
  const high = report.rows.filter(
    (row) => row.disposition === 'open' && row.severity === 'high',
  ).length;
  return `${report.openCount} open exceptions, ${high} serious`;
}

export function openOfKind(report: ExceptionReport, kind: ExceptionKind): ExceptionRow[] {
  return report.rows.filter((row) => row.disposition === 'open' && row.kind === kind);
}
