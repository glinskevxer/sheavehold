import type { Command } from 'commander';
import { ingestUpload, type IngestReceipt } from '../../service/ingest.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';

/**
 * `sheavehold ingest <file...>` is what the overnight job runs. It takes every
 * file it is given, prints one line per upload, and only fails the run when a
 * file could not be read at all. A batch that fails its checksum is reported
 * and the exit code stays zero, because the operator wants the other nine
 * gates taken in and a line telling them which one to go and look at.
 */

export function receiptLine(receipt: IngestReceipt): string {
  const state = receipt.accepted ? 'ok' : 'REFUSED';
  const replayed = receipt.replay ? ' (already seen)' : '';
  return `${receipt.batchId} ${state} read ${receipt.rowsRead} stored ${receipt.rowsStored} replaced ${receipt.rowsReplaced}${replayed}`;
}

export function addIngestCommand(program: Command, app: CliApp, output: Output): void {
  program
    .command('ingest')
    .description('take one or more gate uploads in')
    .argument('<files...>', 'upload files to read')
    .option('--force', 'store the rows even when the envelope does not check out')
    .option('--quiet', 'print only the batches that were refused')
    .action((files: string[], options: { force?: boolean; quiet?: boolean }) => {
      let refused = 0;
      for (const file of files) {
        let text: string;
        try {
          text = app.readFile(file);
        } catch (cause) {
          output.error(`${file}: ${String((cause as Error).message)}`);
          markFailed(program);
          continue;
        }

        const receipt = ingestUpload(text, {
          terminals: app.terminals,
          clocks: app.clocks,
          scans: app.scans,
          sequences: app.sequences,
          receivedAt: app.now(),
          storeUnverified: options.force === true,
        });

        if (!receipt.ok) {
          output.error(`${file}: ${receipt.error}`);
          markFailed(program);
          continue;
        }

        if (!receipt.value.accepted) refused += 1;
        if (options.quiet !== true || !receipt.value.accepted) {
          output.line(`${file}  ${receiptLine(receipt.value)}`);
        }
        for (const complaint of receipt.value.diagnostics.bySeverity('error')) {
          output.error(`  ${complaint.code}: ${complaint.message}`);
        }
      }

      if (refused > 0) output.line(`${refused} batches were refused`);
      const dates = new Set(app.scans.dates());
      if (dates.size > 0) {
        output.line(`the store now holds ${dates.size} operating days`);
      }
    });
}
