import type { Command } from 'commander';
import { formatMoney } from '../../util/money.js';
import { byDayClass, byRides, byVertical } from '../../domain/revenue/weighting.js';
import type { WeightRule } from '../../domain/revenue/attribution.js';
import { dayRevenue, passValue, productRevenue } from '../../service/revenue.js';
import { renderTable, type Column } from '../../util/table.js';
import type { DayRevenue, PassValueLine, ProductRevenue } from '../../service/revenue.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { readPeriodArgs } from '../period.js';

/**
 * The finance commands. The weighting is a flag rather than a setting because
 * the finance office reports on one basis and the marketing office argues for
 * another, and having both able to produce their own number from the same
 * store ended a standing argument.
 */

const dayColumns: Column<DayRevenue>[] = [
  { header: 'date', value: (row) => row.date },
  { header: 'visits', align: 'right', value: (row) => String(row.visits) },
  { header: 'value', align: 'right', value: (row) => formatMoney(row.value) },
  { header: 'per_visit', align: 'right', value: (row) => formatMoney(row.perVisit) },
];

const productColumns: Column<ProductRevenue>[] = [
  { header: 'product', value: (row) => row.productCode },
  { header: 'name', maxWidth: 24, value: (row) => row.productName },
  { header: 'sold', align: 'right', value: (row) => String(row.entitlements) },
  { header: 'visits', align: 'right', value: (row) => String(row.visits) },
  { header: 'value', align: 'right', value: (row) => formatMoney(row.value) },
];

const passColumns: Column<PassValueLine>[] = [
  { header: 'entitlement', value: (row) => row.entitlementId },
  { header: 'guest', value: (row) => row.guestId },
  { header: 'paid', align: 'right', value: (row) => formatMoney(row.pricePaid) },
  { header: 'days', align: 'right', value: (row) => String(row.daysSkied) },
  { header: 'a_day', align: 'right', value: (row) => formatMoney(row.costPerDay) },
  { header: 'beat_window', value: (row) => (row.beatWalkUp ? 'yes' : 'no') },
];

export const WEIGHTINGS = ['even', 'rides', 'vertical', 'rate-card'] as const;

export function weightingNamed(app: CliApp, name: string): WeightRule | undefined {
  if (name === 'rides') return byRides;
  if (name === 'vertical') return byVertical;
  if (name === 'rate-card') return byDayClass((date) => app.calendar.plan(date).dayClass);
  return undefined;
}

export function addRevenueCommand(program: Command, app: CliApp, output: Output): void {
  const revenue = program.command('revenue').description('what the season was worth');
  const context = { reference: app.reference, rides: app.rides };

  revenue
    .command('days')
    .description('what each day was worth')
    .argument('<from>', 'first operating date')
    .argument('<to>', 'last operating date')
    .option('--weighting <name>', `one of ${WEIGHTINGS.join(', ')}`, 'even')
    .action((rawFrom: string, rawTo: string, options: { weighting: string }) => {
      const period = readPeriodArgs(rawFrom, rawTo, program, output);
      if (period === undefined) return;
      if (!(WEIGHTINGS as readonly string[]).includes(options.weighting)) {
        output.error(`${options.weighting} is not a weighting`);
        markFailed(program);
        return;
      }
      const weight = weightingNamed(app, options.weighting);
      const rows = dayRevenue(
        period.from,
        period.to,
        context,
        weight === undefined ? {} : { weight },
      );
      output.line(`revenue ${period.from} to ${period.to}, split ${options.weighting}`);
      output.lines(renderTable(rows, dayColumns));
    });

  revenue
    .command('products')
    .description('what each product was worth')
    .action(() => {
      output.lines(renderTable(productRevenue(context), productColumns));
    });

  revenue
    .command('passes')
    .description('what each unlimited pass cost its holder')
    .action(() => {
      const lines = passValue(context);
      if (lines.length === 0) {
        output.line('no unlimited passes were sold');
        return;
      }
      output.lines(renderTable(lines, passColumns));
    });
}
