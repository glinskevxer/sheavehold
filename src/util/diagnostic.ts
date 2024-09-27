/**
 * One upload can produce thousands of complaints and the ops team needs them
 * grouped, counted and pointed at a line in a file, not thrown one at a time.
 * So every stage of the pipeline carries a bag of these along and the caller
 * decides at the end whether the batch is good enough to keep.
 *
 * Codes are dotted and stable. They end up in the exception register, in the
 * api responses and in the morning sheet, so renaming one is a breaking change.
 */

export type Severity = 'info' | 'warning' | 'error';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  info: 0,
  warning: 1,
  error: 2,
};

export interface SourceRef {
  /** The upload the row arrived in. */
  readonly batch?: string;
  /** File name inside the upload. */
  readonly file?: string;
  /** One based line number. */
  readonly line?: number;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
  readonly source?: SourceRef;
}

export function compareSeverity(left: Severity, right: Severity): number {
  return SEVERITY_RANK[left] - SEVERITY_RANK[right];
}

export function formatSource(source: SourceRef | undefined): string {
  if (source === undefined) return '';
  const parts: string[] = [];
  if (source.batch !== undefined) parts.push(source.batch);
  if (source.file !== undefined) parts.push(source.file);
  if (source.line !== undefined) parts.push(`line ${source.line}`);
  return parts.join(' ');
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const where = formatSource(diagnostic.source);
  const head = `${diagnostic.severity} ${diagnostic.code}`;
  const tail = where === '' ? '' : ` (${where})`;
  return `${head}: ${diagnostic.message}${tail}`;
}

/**
 * Mutable on purpose. The pipeline threads one of these through every stage and
 * a stage that wanted to return a new bag each time would copy tens of
 * thousands of entries on a busy Saturday.
 */
export class DiagnosticBag {
  private readonly entries: Diagnostic[] = [];

  add(diagnostic: Diagnostic): void {
    this.entries.push(diagnostic);
  }

  error(code: string, message: string, context?: Diagnostic['context'], source?: SourceRef): void {
    this.push('error', code, message, context, source);
  }

  warn(code: string, message: string, context?: Diagnostic['context'], source?: SourceRef): void {
    this.push('warning', code, message, context, source);
  }

  info(code: string, message: string, context?: Diagnostic['context'], source?: SourceRef): void {
    this.push('info', code, message, context, source);
  }

  private push(
    severity: Severity,
    code: string,
    message: string,
    context: Diagnostic['context'],
    source: SourceRef | undefined,
  ): void {
    this.entries.push({
      code,
      severity,
      message,
      ...(context === undefined ? {} : { context }),
      ...(source === undefined ? {} : { source }),
    });
  }

  merge(other: DiagnosticBag): void {
    for (const entry of other.all()) this.entries.push(entry);
  }

  all(): readonly Diagnostic[] {
    return this.entries;
  }

  bySeverity(severity: Severity): Diagnostic[] {
    return this.entries.filter((entry) => entry.severity === severity);
  }

  get length(): number {
    return this.entries.length;
  }

  hasErrors(): boolean {
    return this.entries.some((entry) => entry.severity === 'error');
  }

  has(code: string): boolean {
    return this.entries.some((entry) => entry.code === code);
  }

  worst(): Severity | undefined {
    let worst: Severity | undefined;
    for (const entry of this.entries) {
      if (worst === undefined || compareSeverity(entry.severity, worst) > 0) worst = entry.severity;
    }
    return worst;
  }

  /** Counts per code, which is what the upload receipt prints. */
  tally(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      counts.set(entry.code, (counts.get(entry.code) ?? 0) + 1);
    }
    return counts;
  }

  format(): string[] {
    return this.entries.map(formatDiagnostic);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/** Thrown only when a caller asked for something that cannot be answered. */
export class SheaveholdError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, string | number | boolean>>;

  constructor(code: string, message: string, context: SheaveholdError['context'] = {}) {
    super(message);
    this.name = 'SheaveholdError';
    this.code = code;
    this.context = context;
  }
}
