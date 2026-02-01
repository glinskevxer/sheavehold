import { z } from 'zod';
import { parseCsvTable } from '../util/csv.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import { parseTerminalId } from '../util/ids.js';
import { err, ok, type Result } from '../util/result.js';
import { ClockBook, type ClockHandshake } from '../domain/scan/clock-skew.js';

/**
 * The base station writes a handshake line every time a gate checks in, and
 * until now nobody read the file. The clock model was built from whatever
 * handshakes happened to be in memory, which meant a restart threw the whole
 * season of corrections away and every scan before the restart went back to
 * being uncorrected.
 *
 * The file is a plain csv the link daemon appends to, and it is the only thing
 * that survives a power cut, so it is the source of truth for the clock model.
 */

export const handshakeRow = z.object({
  terminal: z.string().min(1),
  server: z.string().min(1),
  gate: z.string().min(1),
});

export type HandshakeRow = z.infer<typeof handshakeRow>;

const REQUIRED = ['terminal', 'server', 'gate'] as const;

export interface HandshakeReadResult {
  readonly handshakes: readonly ClockHandshake[];
  readonly diagnostics: DiagnosticBag;
}

export function readHandshakeFile(text: string, file?: string): Result<HandshakeReadResult> {
  const table = parseCsvTable(text);
  if (!table.ok) return table;
  const missing = REQUIRED.filter((name) => !table.value.header.includes(name));
  if (missing.length > 0) return err(`the handshake file is missing ${missing.join(', ')}`);

  const diagnostics = new DiagnosticBag();
  const handshakes: ClockHandshake[] = [];

  for (const record of table.value.records) {
    const where = { file, line: record.line };
    const terminal = parseTerminalId(record.values['terminal'] ?? '');
    if (!terminal.ok) {
      diagnostics.error('handshake.bad_terminal', terminal.error, {}, where);
      continue;
    }
    const serverAt = new Date(record.values['server'] ?? '');
    const terminalAt = new Date(record.values['gate'] ?? '');
    if (Number.isNaN(serverAt.getTime()) || Number.isNaN(terminalAt.getTime())) {
      diagnostics.error('handshake.bad_time', 'a handshake carries an unreadable time', {}, where);
      continue;
    }
    handshakes.push({ terminalId: terminal.value, serverAt, terminalAt });
  }

  if (handshakes.length === 0 && table.value.records.length > 0) {
    diagnostics.warn('handshake.nothing_usable', 'no handshake in the file could be read');
  }
  return ok({ handshakes, diagnostics });
}

export function clockBookFrom(handshakes: readonly ClockHandshake[]): ClockBook {
  return ClockBook.from(handshakes);
}

export interface DriftReport {
  readonly terminal: string;
  readonly handshakes: number;
  readonly worstDriftPpm: number;
  readonly worstOffsetMs: number;
  readonly needsAttention: boolean;
}

/** One row per gate, worst first, for the maintenance list. */
export function driftReport(clocks: ClockBook): DriftReport[] {
  return clocks
    .terminals()
    .map((terminal) => {
      const clock = clocks.for(terminal);
      return {
        terminal,
        handshakes: clock.count,
        worstDriftPpm: clock.worstDriftPpm(),
        worstOffsetMs: clock.worstOffsetMs(),
        needsAttention: clock.needsAttention(),
      };
    })
    .sort((a, b) => b.worstDriftPpm - a.worstDriftPpm || a.terminal.localeCompare(b.terminal));
}

export function writeHandshakeFile(handshakes: readonly ClockHandshake[]): string {
  const lines = ['terminal,server,gate'];
  for (const entry of handshakes) {
    const server = entry.serverAt.toISOString();
    const gate = entry.terminalAt.toISOString();
    lines.push(`${entry.terminalId},${server},${gate}`);
  }
  return lines.join('\n');
}
