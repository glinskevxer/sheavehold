/**
 * Reports get printed on the ops office thermal printer and pasted into email,
 * so the text renderer is fixed width columns and nothing else. No colour, no
 * box drawing characters, and a hard cap on width because the printer wraps at
 * 96 columns and a wrapped table is unreadable.
 */

export type Align = 'left' | 'right';

export interface Column<T> {
  readonly header: string;
  readonly align?: Align;
  /** Cap this column, cutting with an ellipsis when it runs long. */
  readonly maxWidth?: number;
  readonly value: (row: T) => string;
}

export interface TableOptions {
  /** Two spaces reads better on the printer than a pipe. */
  readonly gap?: string;
  /** Printed under the header. Empty string turns the rule off. */
  readonly rule?: string;
  readonly totalWidth?: number;
}

export const PRINTER_WIDTH = 96;

export function truncate(value: string, width: number): string {
  if (width <= 0) return '';
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

export function padTo(value: string, width: number, align: Align): string {
  if (value.length >= width) return value;
  const pad = ' '.repeat(width - value.length);
  return align === 'right' ? `${pad}${value}` : `${value}${pad}`;
}

function widthOf<T>(column: Column<T>, cells: readonly string[]): number {
  let width = column.header.length;
  for (const cell of cells) width = Math.max(width, cell.length);
  if (column.maxWidth !== undefined) width = Math.min(width, column.maxWidth);
  return width;
}

export function renderTable<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  options: TableOptions = {},
): string[] {
  if (columns.length === 0) return [];
  const gap = options.gap ?? '  ';
  const rule = options.rule ?? '-';

  const cells = columns.map((column) => rows.map((row) => column.value(row)));
  const widths = columns.map((column, index) => widthOf(column, cells[index] ?? []));

  const lines: string[] = [];
  lines.push(
    columns
      .map((column, index) =>
        padTo(
          truncate(column.header, widths[index] ?? 0),
          widths[index] ?? 0,
          column.align ?? 'left',
        ),
      )
      .join(gap)
      .trimEnd(),
  );
  if (rule !== '') {
    lines.push(widths.map((width) => rule.repeat(width)).join(gap));
  }
  for (let r = 0; r < rows.length; r += 1) {
    lines.push(
      columns
        .map((column, index) => {
          const width = widths[index] ?? 0;
          const raw = cells[index]?.[r] ?? '';
          return padTo(truncate(raw, width), width, column.align ?? 'left');
        })
        .join(gap)
        .trimEnd(),
    );
  }

  const cap = options.totalWidth ?? PRINTER_WIDTH;
  return lines.map((line) => (line.length > cap ? truncate(line, cap) : line));
}

/** A label and a value, which is most of what the morning sheet is. */
export function renderPairs(
  pairs: readonly (readonly [string, string])[],
  options: TableOptions = {},
): string[] {
  const gap = options.gap ?? '  ';
  const labelWidth = pairs.reduce((width, [label]) => Math.max(width, label.length), 0);
  return pairs.map(([label, value]) => `${padTo(label, labelWidth, 'left')}${gap}${value}`);
}

/** Centre a title over a rule, used at the top of every printed report. */
export function renderHeading(title: string, width = PRINTER_WIDTH): string[] {
  const trimmed = truncate(title, width);
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return [`${' '.repeat(left)}${trimmed}`, '='.repeat(width)];
}

export function indent(lines: readonly string[], by = 2): string[] {
  const prefix = ' '.repeat(by);
  return lines.map((line) => (line === '' ? line : `${prefix}${line}`));
}
