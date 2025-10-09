import type { Command } from 'commander';
import { VERSION } from '../main.js';
import type { Output } from '../output.js';
import type { CliApp } from '../app.js';

/**
 * `sheavehold about` prints what this build is and what it is pointed at. It
 * exists because the first question on every support call is which build the
 * lift shack is running, and reading it off the package was never reliable
 * after somebody copied a directory.
 */
export function addAboutCommand(program: Command, app: CliApp, output: Output): void {
  program
    .command('about')
    .description('what this build is and what it holds')
    .action(() => {
      output.line(`sheavehold ${VERSION}`);
      output.line(`season ${app.calendar.season.name}`);
      output.line(`lifts ${app.lifts.size}, terminals ${app.terminals.size}`);
      output.line(`scans ${app.scans.scans.size}, rides ${app.rides.rides.size}`);
      output.line(`open exceptions ${app.register.open().length}`);
    });
}
