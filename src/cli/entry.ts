import { readFileSync, writeFileSync } from 'node:fs';
import { OperatingCalendar, makeSeason } from '../domain/calendar/season.js';
import { ExceptionRegister } from '../domain/exception/register.js';
import { TransferMap } from '../domain/exception/transfer.js';
import { GuestDirectory } from '../domain/guest/guest.js';
import { LiftRegistry } from '../domain/lift/lift.js';
import { TerminalRegistry } from '../domain/lift/terminal.js';
import { BlackoutRegistry } from '../domain/product/blackout.js';
import { ProductCatalogue } from '../domain/product/product.js';
import { ClockBook } from '../domain/scan/clock-skew.js';
import { SequenceLedger } from '../ingest/envelope.js';
import { ReferenceStore } from '../storage/repository/reference.js';
import { RideStore } from '../storage/repository/rides.js';
import { ScanStore } from '../storage/repository/scans.js';
import { expect as expectOk } from '../util/result.js';
import type { CliApp } from './app.js';
import { addAboutCommand } from './commands/version.js';
import { addDayCommand } from './commands/day.js';
import { addDoctorCommand } from './commands/doctor.js';
import { addExceptionsCommand } from './commands/exceptions.js';
import { addGuestCommand } from './commands/guest.js';
import { addIngestCommand } from './commands/ingest.js';
import { addLiftCommand } from './commands/lift.js';
import { addReplayCommand } from './commands/replay.js';
import { addRevenueCommand } from './commands/revenue.js';
import { addSeasonCommand } from './commands/season.js';
import { runCli, type CommandBuilder } from './main.js';
import { streamOutput } from './output.js';

/**
 * The real entry point. Everything a command needs is built here and handed
 * in, so nothing under `commands/` ever opens a file or reads the clock on its
 * own. That is what lets the whole command line be tested without a disk.
 */

export const BUILDERS: readonly CommandBuilder[] = [
  addAboutCommand,
  addDayCommand,
  addDoctorCommand,
  addExceptionsCommand,
  addGuestCommand,
  addIngestCommand,
  addLiftCommand,
  addReplayCommand,
  addRevenueCommand,
  addSeasonCommand,
];

/** An empty store, which is what a base station starts its season with. */
export function emptyApp(): CliApp {
  const season = expectOk(
    makeSeason({ name: '2024/25', opensOn: '2024-11-22', closesOn: '2025-04-13' }),
    'season',
  );
  return {
    reference: new ReferenceStore(),
    scans: new ScanStore(),
    rides: new RideStore(),
    register: new ExceptionRegister(),
    terminals: new TerminalRegistry(),
    lifts: new LiftRegistry(),
    products: new ProductCatalogue(),
    calendar: new OperatingCalendar(season),
    blackouts: new BlackoutRegistry(),
    clocks: new ClockBook(),
    transfers: new TransferMap(),
    guests: new GuestDirectory(),
    sequences: new SequenceLedger(),
    now: () => new Date(),
    readFile: (path) => readFileSync(path, 'utf8'),
    writeFile: (path, text) => {
      writeFileSync(path, text, 'utf8');
    },
  };
}

export function main(argv: readonly string[], app: CliApp = emptyApp()): number {
  return runCli(argv, {
    app,
    output: streamOutput(
      (text) => process.stdout.write(text),
      (text) => process.stderr.write(text),
    ),
    builders: BUILDERS,
  });
}

if (process.argv[1]?.endsWith('entry.js') === true) {
  process.exitCode = main(process.argv.slice(2));
}
