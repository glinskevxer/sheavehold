import type { Command } from 'commander';
import { buildExceptionReport, renderExceptionReport } from '../../report/exceptions.js';
import { applyOverride, scanDateForExceptions } from '../../service/exceptions.js';
import { isDisposition } from '../../domain/exception/register.js';
import { exceptionScanContext } from '../../service/stores.js';
import { renderPairs } from '../../util/table.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { readDateArg, readPeriodArgs } from '../period.js';

/**
 * The supervisor commands. Deciding refuses to run without a name, and the
 * name is not defaulted from the login: a decision about a guest has to have
 * somebody willing to type their own name behind it, and the shift laptop is
 * logged in as ops all season.
 */

export function addExceptionsCommand(program: Command, app: CliApp, output: Output): void {
  const exceptions = program.command('exceptions').description('the supervisor work queue');

  exceptions
    .command('list')
    .description('the register over a period')
    .argument('<from>', 'first operating date')
    .argument('<to>', 'last operating date')
    .option('--open', 'only the findings nobody has decided')
    .action((rawFrom: string, rawTo: string, options: { open?: boolean }) => {
      const period = readPeriodArgs(rawFrom, rawTo, program, output);
      if (period === undefined) return;
      const report = buildExceptionReport(period.from, period.to, app.register, period.to);
      const filtered =
        options.open === true
          ? { ...report, rows: report.rows.filter((row) => row.disposition === 'open') }
          : report;
      output.lines(renderExceptionReport(filtered));
    });

  exceptions
    .command('scan')
    .description('run the fraud rules over a day again')
    .argument('<date>', 'operating date')
    .action((raw: string) => {
      const date = readDateArg(raw, program, output);
      if (date === undefined) return;
      const result = scanDateForExceptions(date, exceptionScanContext(app));
      output.lines(
        renderPairs([
          ['date', result.date],
          ['found', String(result.found)],
          ['new', String(result.added)],
          ['already known', String(result.kept)],
          ['dropped', String(result.dropped)],
          ['softened', String(result.softened)],
        ]),
      );
    });

  exceptions
    .command('decide')
    .description('record a decision about a finding')
    .argument('<id>', 'exception id')
    .argument('<disposition>', 'confirmed, dismissed, referred or open')
    .requiredOption('--by <name>', 'who is deciding')
    .option('--note <text>', 'what they want recorded')
    .action((id: string, disposition: string, options: { by: string; note?: string }) => {
      if (!isDisposition(disposition)) {
        output.error(`${disposition} is not a disposition`);
        markFailed(program);
        return;
      }
      const applied = applyOverride(app.register, {
        exceptionId: id,
        disposition,
        by: options.by,
        at: app.now(),
        note: options.note,
      });
      if (!applied.ok) {
        output.error(applied.error);
        markFailed(program);
        return;
      }
      const { exceptionId, from, to, by } = applied.value;
      output.line(`${exceptionId} went from ${from} to ${to}, by ${by}`);
    });
}
