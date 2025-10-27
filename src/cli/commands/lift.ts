import type { Command } from 'commander';
import { parseOperatingDate } from '../../util/clock.js';
import { parseLiftCode } from '../../util/ids.js';
import { designCapacityPerHour, verticalRiseFt } from '../../domain/lift/lift.js';
import { hourLabel, hourlyProfile } from '../../domain/capacity/capacity.js';
import { LiftSpeedModel } from '../../domain/ride/ride-time.js';
import { liftDay } from '../../service/lift-query.js';
import { buildUtilisationReport, renderUtilisationReport } from '../../report/utilisation.js';
import { renderPairs, renderTable, type Column } from '../../util/table.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';
import { dailyContext } from './day.js';

/**
 * `sheavehold lift` answers the two questions the lift maintenance department
 * asks: what did this lift carry, and was it running to speed. The second is
 * inferred rather than measured, and the command says so on the line rather
 * than letting somebody quote it as a reading off a sensor.
 */

interface HourRow {
  hour: number;
  rides: number;
  riders: number;
}

const hourColumns: Column<HourRow>[] = [
  { header: 'hour', value: (row) => hourLabel(row.hour) },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
  { header: 'riders', align: 'right', value: (row) => String(row.riders) },
];

export function addLiftCommand(program: Command, app: CliApp, output: Output): void {
  const lift = program.command('lift').description('what the lifts did');

  lift
    .command('day')
    .description('every lift on one day')
    .argument('<date>', 'operating date')
    .action((raw: string) => {
      const date = parseOperatingDate(raw);
      if (!date.ok) {
        output.error(date.error);
        markFailed(program);
        return;
      }
      const rows = liftDay(date.value, dailyContext(app));
      output.line(`lifts on ${date.value}`);
      output.lines(
        renderTable(rows, [
          { header: 'lift', value: (row) => row.lift },
          { header: 'name', maxWidth: 22, value: (row) => row.name },
          { header: 'rides', align: 'right', value: (row) => String(row.rides) },
          { header: 'riders', align: 'right', value: (row) => String(row.riders) },
          { header: 'vertical', align: 'right', value: (row) => String(row.verticalFt) },
        ]),
      );
    });

  lift
    .command('show')
    .description('one lift on one day, hour by hour')
    .argument('<lift>', 'lift code')
    .argument('<date>', 'operating date')
    .action((rawLift: string, rawDate: string) => {
      const code = parseLiftCode(rawLift);
      if (!code.ok) {
        output.error(code.error);
        markFailed(program);
        return;
      }
      const date = parseOperatingDate(rawDate);
      if (!date.ok) {
        output.error(date.error);
        markFailed(program);
        return;
      }
      const record = app.lifts.find(code.value);
      if (record === undefined) {
        output.error(`no lift ${code.value}`);
        markFailed(program);
        return;
      }
      const rides = app.rides.ridesOnLift(code.value, date.value);
      const model = LiftSpeedModel.observe(rides, app.lifts);
      const reading = model.reading(code.value);
      output.lines(
        renderPairs([
          ['lift', `${record.code} ${record.name}`],
          ['rise', `${verticalRiseFt(record)} ft`],
          ['design capacity', `${designCapacityPerHour(record)} an hour`],
          ['rides', String(rides.length)],
          [
            'observed ride time',
            reading?.confident === true
              ? `${reading.observedMinutes} minutes, inferred from the laps`
              : 'not enough laps to say',
          ],
        ]),
      );
      output.line('');
      output.lines(renderTable(hourlyProfile(rides), hourColumns));
    });

  lift
    .command('utilisation')
    .description('utilisation over a period')
    .argument('<from>', 'first operating date')
    .argument('<to>', 'last operating date')
    .option('--threshold <percent>', 'what counts as a pinched hour', '70')
    .action((rawFrom: string, rawTo: string, options: { threshold: string }) => {
      const from = parseOperatingDate(rawFrom);
      const to = parseOperatingDate(rawTo);
      if (!from.ok || !to.ok) {
        output.error(from.ok ? (to.ok ? '' : to.error) : from.error);
        markFailed(program);
        return;
      }
      const threshold = Number(options.threshold);
      if (!Number.isFinite(threshold) || threshold <= 0) {
        output.error(`${options.threshold} is not a threshold`);
        markFailed(program);
        return;
      }
      const report = buildUtilisationReport(from.value, to.value, dailyContext(app), threshold);
      output.lines(renderUtilisationReport(report));
    });
}
