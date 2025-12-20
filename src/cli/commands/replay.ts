import type { Command } from 'commander';
import { operatingDateRange, type OperatingDate } from '../../util/clock.js';
import { restateDate, restateStore } from '../../service/restate.js';
import { recomputeDates } from '../../service/recompute.js';
import { sumBy } from '../../util/collect.js';
import { renderPairs } from '../../util/table.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { readDateArg, readPeriodArgs } from '../period.js';
import { recomputeContext } from './day.js';

/**
 * Rebuilding from the scans that are on file, which is what a rule change or a
 * late batch of handshakes needs. It is deliberately two steps in one command:
 * restate the scans against the clock model as it stands now, then rebuild
 * every day the restatement touched, plus whatever the operator asked for.
 *
 * Doing only the second half is the mistake this command exists to prevent. A
 * day rebuilt without restating still holds scans corrected by a clock model
 * that has since been superseded.
 */

function sorted(dates: Iterable<string>): OperatingDate[] {
  return [...new Set(dates)].sort() as OperatingDate[];
}

export function addReplayCommand(program: Command, app: CliApp, output: Output): void {
  const replay = program.command('replay').description('rebuild from the scans on file');

  replay
    .command('day')
    .description('restate and rebuild one day')
    .argument('<date>', 'operating date')
    .action((raw: string) => {
      const date = readDateArg(raw, program, output);
      if (date === undefined) return;
      const restated = restateDate(app.scans, app.clocks, date);
      const results = recomputeDates(sorted([date, ...restated.dirtyDates]), recomputeContext(app));
      output.lines(
        renderPairs([
          ['restated', String(restated.scans.length)],
          ['moved day', String(restated.moves.length)],
          ['days rebuilt', String(results.length)],
          ['rides', String(sumBy(results, (result) => result.rides.length))],
        ]),
      );
    });

  replay
    .command('period')
    .description('restate and rebuild a period')
    .argument('<from>', 'first operating date')
    .argument('<to>', 'last operating date')
    .action((rawFrom: string, rawTo: string) => {
      const period = readPeriodArgs(rawFrom, rawTo, program, output);
      if (period === undefined) return;
      const restated = restateStore(app.scans, app.clocks);
      const results = recomputeDates(
        sorted([...operatingDateRange(period.from, period.to), ...restated.dirtyDates]),
        recomputeContext(app),
      );
      output.line(`replayed ${period.from} to ${period.to}`);
      output.lines(
        renderPairs([
          ['scans restated', String(restated.scans.length)],
          ['scans that moved day', String(restated.moves.length)],
          ['days rebuilt', String(results.length)],
          ['rides', String(sumBy(results, (result) => result.rides.length))],
          ['visits', String(sumBy(results, (result) => result.visits.length))],
        ]),
      );
      for (const move of restated.moves) {
        output.line(`  ${move.key} moved from ${move.from} to ${move.to}`);
      }
    });

  replay
    .command('all')
    .description('restate and rebuild every day on file')
    .option('--dry-run', 'say what would move without rebuilding anything')
    .action((options: { dryRun?: boolean }) => {
      const dates = app.scans.dates();
      if (dates.length === 0) {
        output.error('the store holds no scans');
        markFailed(program);
        return;
      }
      const restated = restateStore(app.scans, app.clocks);
      if (options.dryRun === true) {
        output.line(`${restated.moves.length} scans would move day`);
        output.line(`${dates.length} days would be rebuilt`);
        return;
      }
      const results = recomputeDates(
        sorted([...dates, ...restated.dirtyDates]),
        recomputeContext(app),
      );
      output.line(`rebuilt ${results.length} days from ${restated.scans.length} scans`);
    });
}
