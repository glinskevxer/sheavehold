import type { Command } from 'commander';
import { buildDailyReport } from '../../report/daily.js';
import { renderDailyCsv } from '../../report/csv.js';
import { renderDailyJson } from '../../report/json.js';
import { renderDailyReportText } from '../../report/text.js';
import { recomputeDate } from '../../service/recompute.js';
import { recomputeContext, reportContext } from '../../service/stores.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { readDateArg } from '../period.js';

/**
 * `sheavehold day <date>` is the command anybody in the ops office actually
 * types. It prints the sheet, and with `--rebuild` it recomputes first, which
 * is what somebody wants after a late upload and what they would otherwise do
 * with two commands and forget the order of.
 */

export interface DayOptions {
  readonly format?: string;
  readonly rebuild?: boolean;
  readonly out?: string;
}

export function addDayCommand(program: Command, app: CliApp, output: Output): void {
  program
    .command('day')
    .description('the daily operations sheet')
    .argument('<date>', 'operating date, YYYY-MM-DD')
    .option('--format <format>', 'text, json or csv', 'text')
    .option('--rebuild', 'recompute the day before printing it')
    .option('--out <file>', 'write to a file instead of the terminal')
    .action((raw: string, options: DayOptions) => {
      const date = readDateArg(raw, program, output);
      if (date === undefined) return;

      if (options.rebuild === true) {
        const result = recomputeDate(date, recomputeContext(app));
        output.line(`rebuilt ${result.date} to ${result.rides.length} rides`);
      }

      const report = buildDailyReport(date, reportContext(app));
      const format = options.format ?? 'text';
      let body: string;
      if (format === 'json') body = renderDailyJson(report, true);
      else if (format === 'csv') body = renderDailyCsv(report).summary;
      else if (format === 'text') body = renderDailyReportText(report).join('\n');
      else {
        output.error(`${format} is not a format this command writes`);
        markFailed(program);
        return;
      }

      if (options.out === undefined) {
        output.lines(body.split('\n'));
        return;
      }
      app.writeFile(options.out, `${body}\n`);
      output.line(`wrote ${options.out}`);
    });
}
