import type { Command } from 'commander';
import { buildSeasonReport, renderSeasonReport } from '../../report/season.js';
import { buildComparison, renderComparison } from '../../report/comparison.js';
import { buildLeaderboard, renderLeaderboard } from '../../report/leaderboard.js';
import { buildProductMix, renderProductMix } from '../../report/product-mix.js';
import type { CliApp } from '../app.js';
import type { Output } from '../output.js';
import { readCount, readDateArg, readSeasonPeriod } from '../period.js';
import { reportContext } from '../../service/stores.js';

/**
 * The season commands, which are the ones that go in an email rather than on
 * the wall. Every one of them defaults its start to the season opening, because
 * every time somebody typed the start by hand they typed the calendar year and
 * the report came out short by six weeks.
 */

export function seasonStart(app: CliApp): string {
  return app.calendar.season.opensOn;
}

export function addSeasonCommand(program: Command, app: CliApp, output: Output): void {
  const season = program.command('season').description('the season, not the day');

  season
    .command('summary')
    .description('season to date')
    .argument('<to>', 'last operating date')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .action((rawTo: string, options: { from?: string }) => {
      const period = readSeasonPeriod(app, rawTo, options.from, program, output);
      if (period === undefined) return;
      output.lines(
        renderSeasonReport(buildSeasonReport(period.from, period.to, reportContext(app))),
      );
    });

  season
    .command('compare')
    .description('this season against an earlier one')
    .argument('<to>', 'last operating date of this season')
    .requiredOption('--against <date>', 'the opening of the season to compare with')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .action((rawTo: string, options: { against: string; from?: string }) => {
      const period = readSeasonPeriod(app, rawTo, options.from, program, output);
      if (period === undefined) return;
      const against = readDateArg(options.against, program, output, 'against');
      if (against === undefined) return;
      output.lines(
        renderComparison(buildComparison(period.from, period.to, against, reportContext(app))),
      );
    });

  season
    .command('leaderboard')
    .description('the vertical leaderboard')
    .argument('<to>', 'last operating date')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .option('--limit <count>', 'how many to list', '10')
    .action((rawTo: string, options: { from?: string; limit: string }) => {
      const period = readSeasonPeriod(app, rawTo, options.from, program, output);
      if (period === undefined) return;
      const limit = readCount(options.limit, program, output, 'limit');
      if (limit === undefined) return;
      const report = buildLeaderboard(
        period.from,
        period.to,
        { reference: app.reference, rides: app.rides },
        limit,
      );
      output.lines(renderLeaderboard(report));
    });

  season
    .command('products')
    .description('the product mix')
    .argument('<to>', 'last operating date')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .action((rawTo: string, options: { from?: string }) => {
      const period = readSeasonPeriod(app, rawTo, options.from, program, output);
      if (period === undefined) return;
      output.lines(renderProductMix(buildProductMix(period.from, period.to, reportContext(app))));
    });
}
