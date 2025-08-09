import { indent, renderPairs, renderTable, type Column } from '../util/table.js';

/**
 * Five reports had five copies of the same assembly: a title, a blank line, a
 * heading, an indented table, a blank line, a footer. They had drifted. Two
 * indented their tables and three did not, one put its footer before the blank
 * line, and the exception register printed a heading over an empty table where
 * every other report printed a sentence instead.
 *
 * So a report is a document now, and the writer is the only thing that knows
 * how a document turns into lines. A section carries its own body as a closure
 * because the row type differs per section and the document must not be generic
 * in five type parameters.
 */

export interface Section {
  readonly kind: 'table' | 'pairs' | 'lines';
  readonly heading: string | undefined;
  readonly body: () => string[];
  readonly isEmpty: boolean;
}

export interface ReportDocument {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly sections: readonly Section[];
  readonly footer?: readonly string[] | undefined;
}

export interface TableSectionOptions {
  readonly heading?: string | undefined;
  /** Printed instead of a header row with nothing under it. */
  readonly emptyNote?: string | undefined;
}

export function tableSection<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  options: TableSectionOptions = {},
): Section {
  return {
    kind: 'table',
    heading: options.heading,
    isEmpty: rows.length === 0,
    body: () => {
      if (rows.length === 0 && options.emptyNote !== undefined) return [options.emptyNote];
      return renderTable(rows, columns);
    },
  };
}

export function pairsSection(
  pairs: readonly (readonly [string, string])[],
  heading?: string,
): Section {
  return {
    kind: 'pairs',
    heading,
    isEmpty: pairs.length === 0,
    body: () => renderPairs(pairs),
  };
}

export function linesSection(lines: readonly string[], heading?: string): Section {
  return {
    kind: 'lines',
    heading,
    isEmpty: lines.length === 0,
    body: () => [...lines],
  };
}

function renderSection(section: Section): string[] {
  const out: string[] = [];
  if (section.heading !== undefined) out.push(section.heading);
  out.push(...indent(section.body()));
  return out;
}

export function renderDocument(document: ReportDocument): string[] {
  const lines: string[] = [document.title];
  if (document.subtitle !== undefined) lines.push(document.subtitle);
  for (const section of document.sections) {
    lines.push('');
    lines.push(...renderSection(section));
  }
  if (document.footer !== undefined && document.footer.length > 0) {
    lines.push('');
    lines.push(...document.footer);
  }
  return lines;
}

export function documentToText(document: ReportDocument): string {
  return renderDocument(document).join('\n');
}
