import type { Command } from 'commander';
import { writeCsvTable } from '../util/csv.js';
import { markFailed } from './main.js';
import type { Output } from './output.js';

/**
 * Every report command grew its own `--format` and they had not stayed level.
 * The day command wrote json, text and csv, the season commands wrote text
 * only, and the lift commands ignored the flag entirely while still accepting
 * it, which is the worst of the three.
 *
 * So a command declares which formats it can actually produce and this decides
 * what to do with the flag. A command that cannot write csv now says so rather
 * than quietly printing text.
 */

export const FORMATS = ['text', 'json', 'csv'] as const;

export type Format = (typeof FORMATS)[number];

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

export interface Rendered {
  readonly text?: readonly string[] | undefined;
  readonly json?: unknown;
  readonly csv?: { header: readonly string[]; rows: readonly Record<string, string>[] } | undefined;
}

export function readFormat(
  raw: string,
  supported: readonly Format[],
  program: Command,
  output: Output,
): Format | undefined {
  if (!isFormat(raw)) {
    output.error(`${raw} is not a format, try ${supported.join(', ')}`);
    markFailed(program);
    return undefined;
  }
  if (!supported.includes(raw)) {
    output.error(`this command does not write ${raw}, only ${supported.join(', ')}`);
    markFailed(program);
    return undefined;
  }
  return raw;
}

/** Turn what a command produced into the lines the flag asked for. */
export function emit(format: Format, rendered: Rendered, output: Output): boolean {
  if (format === 'json') {
    if (rendered.json === undefined) return false;
    output.lines(JSON.stringify(rendered.json, null, 2).split('\n'));
    return true;
  }
  if (format === 'csv') {
    if (rendered.csv === undefined) return false;
    output.lines(writeCsvTable(rendered.csv.header, rendered.csv.rows).split('\n'));
    return true;
  }
  if (rendered.text === undefined) return false;
  output.lines(rendered.text);
  return true;
}

/** Attach the flag to a command with only the formats it can honour. */
export function withFormat(command: Command, supported: readonly Format[]): Command {
  return command.option('--format <format>', `one of ${supported.join(', ')}`, 'text');
}

export function formatsOf(rendered: Rendered): Format[] {
  const out: Format[] = [];
  if (rendered.text !== undefined) out.push('text');
  if (rendered.json !== undefined) out.push('json');
  if (rendered.csv !== undefined) out.push('csv');
  return out;
}
