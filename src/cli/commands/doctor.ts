import type { Command } from 'commander';
import { checkIntegrity, summariseIntegrity } from '../../storage/integrity.js';
import { formatDiagnostic } from '../../util/diagnostic.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';

/**
 * `sheavehold doctor` is what somebody runs when a number looks wrong. It only
 * reads, it never repairs, and the exit code is the whole point: the overnight
 * job runs it and pages somebody when it comes back non zero, which is the only
 * way a store that quietly went inconsistent in December gets noticed before
 * the season report in April.
 */

export function addDoctorCommand(program: Command, app: CliApp, output: Output): void {
  program
    .command('doctor')
    .description('check the store over, reading only')
    .option('--quiet', 'print nothing unless something is wrong')
    .option('--warnings', 'fail the run on warnings too')
    .action((options: { quiet?: boolean; warnings?: boolean }) => {
      const report = checkIntegrity({
        reference: app.reference,
        scans: app.scans,
        rides: app.rides,
      });

      const errors = report.diagnostics.bySeverity('error');
      const warnings = report.diagnostics.bySeverity('warning');

      if (options.quiet !== true) {
        output.lines(summariseIntegrity(report));
      }
      for (const entry of errors) output.error(formatDiagnostic(entry));
      for (const entry of warnings) output.line(formatDiagnostic(entry));

      const gateChecks = app.clocks.needingAttention();
      for (const terminal of gateChecks) {
        output.line(`warning clock.drift: gate ${terminal} needs a work order`);
      }

      if (errors.length > 0) {
        markFailed(program);
        return;
      }
      if (options.warnings === true && (warnings.length > 0 || gateChecks.length > 0)) {
        markFailed(program);
      }
    });
}
