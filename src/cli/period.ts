import type { Command } from 'commander';
import { operatingDaysBetween, parseOperatingDate, type OperatingDate } from '../util/clock.js';
import type { CliApp } from './app.js';
import { markFailed } from './main.js';
import type { Output } from './output.js';

/**
 * Five commands were each parsing a date, checking it, printing their own
 * message and marking the run failed, in five slightly different ways. Two of
 * them printed the parse error and three printed their own sentence, one
 * checked the order of a period and the rest did not, and the season commands
 * each repeated the default start.
 *
 * So it happens here once. A command asks for a date or a period, gets one or
 * gets nothing, and the failure has already been reported.
 */

export interface Period {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
}

export function readDateArg(
  raw: string,
  program: Command,
  output: Output,
  label = 'date',
): OperatingDate | undefined {
  const parsed = parseOperatingDate(raw);
  if (!parsed.ok) {
    output.error(`${label}: ${parsed.error}`);
    markFailed(program);
    return undefined;
  }
  return parsed.value;
}

export function readPeriodArgs(
  rawFrom: string,
  rawTo: string,
  program: Command,
  output: Output,
): Period | undefined {
  const from = readDateArg(rawFrom, program, output, 'from');
  if (from === undefined) return undefined;
  const to = readDateArg(rawTo, program, output, 'to');
  if (to === undefined) return undefined;
  if (operatingDaysBetween(from, to) < 0) {
    output.error(`to ${to} is before from ${from}`);
    markFailed(program);
    return undefined;
  }
  return { from, to };
}

/** A period whose start defaults to the season opening, which most reports want. */
export function readSeasonPeriod(
  app: CliApp,
  rawTo: string,
  rawFrom: string | undefined,
  program: Command,
  output: Output,
): Period | undefined {
  return readPeriodArgs(rawFrom ?? app.calendar.season.opensOn, rawTo, program, output);
}

export function readCount(
  raw: string,
  program: Command,
  output: Output,
  label = 'count',
): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    output.error(`${label}: ${raw} is not a whole number above zero`);
    markFailed(program);
    return undefined;
  }
  return value;
}
