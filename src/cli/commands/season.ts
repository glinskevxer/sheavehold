import type { Command } from 'commander';
import { parseOperatingDate } from '../../util/clock.js';
import { buildSeasonReport, renderSeasonReport } from '../../report/season.js';
import { buildComparison, renderComparison } from '../../report/comparison.js';
import { buildLeaderboard, renderLeaderboard } from '../../report/leaderboard.js';
import { buildProductMix, renderProductMix } from '../../report/product-mix.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { dailyContext } from './day.js';

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
      const to = parseOperatingDate(rawTo);
      if (!to.ok) {
        output.error(to.error);
        markFailed(program);
        return;
      }
      const from = parseOperatingDate(options.from ?? seasonStart(app));
      if (!from.ok) {
        output.error(from.error);
        markFailed(program);
        return;
      }
      output.lines(renderSeasonReport(buildSeasonReport(from.value, to.value, dailyContext(app))));
    });

  season
    .command('compare')
    .description('this season against an earlier one')
    .argument('<to>', 'last operating date of this season')
    .requiredOption('--against <date>', 'the opening of the season to compare with')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .action((rawTo: string, options: { against: string; from?: string }) => {
      const to = parseOperatingDate(rawTo);
      const from = parseOperatingDate(options.from ?? seasonStart(app));
      const against = parseOperatingDate(options.against);
      if (!to.ok || !from.ok || !against.ok) {
        output.error('every date must be YYYY-MM-DD');
        markFailed(program);
        return;
      }
      output.lines(
        renderComparison(buildComparison(from.value, to.value, against.value, dailyContext(app))),
      );
    });

  season
    .command('leaderboard')
    .description('the vertical leaderboard')
    .argument('<to>', 'last operating date')
    .option('--from <date>', 'first operating date, defaults to the season opening')
    .option('--limit <count>', 'how many to list', '10')
    .action((rawTo: string, options: { from?: string; limit: string }) => {
      const to = parseOperatingDate(rawTo);
      const from = parseOperatingDate(options.from ?? seasonStart(app));
      if (!to.ok || !from.ok) {
        output.error('every date must be YYYY-MM-DD');
        markFailed(program);
        return;
      }
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1) {
        output.error(`${options.limit} is not a count`);
        markFailed(program);
        return;
      }
      const report = buildLeaderboard(
        from.value,
        to.value,
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
      const to = parseOperatingDate(rawTo);
      const from = parseOperatingDate(options.from ?? seasonStart(app));
      if (!to.ok || !from.ok) {
        output.error('every date must be YYYY-MM-DD');
        markFailed(program);
        return;
      }
      output.lines(renderProductMix(buildProductMix(from.value, to.value, dailyContext(app))));
    });
}
