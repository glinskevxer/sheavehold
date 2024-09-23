import { err, ok, type Result } from './result.js';

/**
 * The older gate controllers export comma separated files and the finance
 * office reads our reports back in as comma separated files, so this goes both
 * ways. It is deliberately not a one line split. Terminal exports carry a byte
 * order mark, mixed line endings, quoted fields with commas in them and, on the
 * units that were reflashed in 2019, a trailing empty line that a naive reader
 * turns into a row of one empty column.
 */

export interface CsvRow {
  readonly line: number;
  readonly fields: readonly string[];
}

export interface CsvOptions {
  /** Field separator. The 2019 units emit semicolons. */
  readonly delimiter?: string;
  /** Drop rows where every field is empty. On by default. */
  readonly skipBlankRows?: boolean;
}

const QUOTE = '"';

export function parseCsv(text: string, options: CsvOptions = {}): Result<CsvRow[]> {
  const delimiter = options.delimiter ?? ',';
  if (delimiter.length !== 1) return err(`delimiter ${JSON.stringify(delimiter)} is not one char`);
  const skipBlank = options.skipBlankRows ?? true;

  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  let touched = false;

  const endField = () => {
    fields.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    const empty = fields.every((value) => value === '');
    if (!(skipBlank && empty)) rows.push({ line: rowStart, fields });
    fields = [];
    touched = false;
    rowStart = line;
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === undefined) break;
    if (inQuotes) {
      if (char === QUOTE) {
        if (body[i + 1] === QUOTE) {
          field += QUOTE;
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === QUOTE) {
      if (field !== '') return err(`line ${line}: a quote opens in the middle of a field`);
      inQuotes = true;
      touched = true;
      continue;
    }
    if (char === delimiter) {
      endField();
      touched = true;
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      line += 1;
      endRow();
      rowStart = line;
      continue;
    }
    field += char;
    touched = true;
  }

  if (inQuotes) return err(`line ${rowStart}: the file ends inside a quoted field`);
  if (touched || field !== '' || fields.length > 0) endRow();
  return ok(rows);
}

export interface CsvTable {
  readonly header: readonly string[];
  readonly records: readonly CsvRecord[];
}

export interface CsvRecord {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

/** Read with the first row as a header, which is what every export here has. */
export function parseCsvTable(text: string, options: CsvOptions = {}): Result<CsvTable> {
  const parsed = parseCsv(text, options);
  if (!parsed.ok) return parsed;
  const [head, ...rest] = parsed.value;
  if (head === undefined) return err('the file has no header row');
  const header = head.fields.map((name) => name.trim());
  const seen = new Set<string>();
  for (const name of header) {
    if (name === '') return err('the header row has an empty column name');
    if (seen.has(name)) return err(`the header names ${name} twice`);
    seen.add(name);
  }
  const records: CsvRecord[] = [];
  for (const row of rest) {
    if (row.fields.length !== header.length) {
      return err(`line ${row.line}: ${row.fields.length} fields against ${header.length} columns`);
    }
    const values: Record<string, string> = {};
    header.forEach((name, index) => {
      values[name] = row.fields[index] ?? '';
    });
    records.push({ line: row.line, values });
  }
  return ok({ header, records });
}

function needsQuoting(value: string, delimiter: string): boolean {
  return (
    value.includes(delimiter) ||
    value.includes(QUOTE) ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ')
  );
}

export function escapeCsvField(value: string, delimiter = ','): string {
  if (!needsQuoting(value, delimiter)) return value;
  return `${QUOTE}${value.replace(/"/g, '""')}${QUOTE}`;
}

export function writeCsv(rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  return rows
    .map((row) => row.map((field) => escapeCsvField(field, delimiter)).join(delimiter))
    .join('\n');
}

export function writeCsvTable(
  header: readonly string[],
  records: readonly Readonly<Record<string, string>>[],
  options: CsvOptions = {},
): string {
  const rows: string[][] = [header.slice()];
  for (const record of records) {
    rows.push(header.map((name) => record[name] ?? ''));
  }
  return writeCsv(rows, options);
}
