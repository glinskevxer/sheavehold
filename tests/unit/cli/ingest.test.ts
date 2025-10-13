import { describe, expect, it } from 'vitest';
import { addIngestCommand, receiptLine } from '../../../src/cli/commands/ingest.js';
import { EXIT_FAILED, EXIT_OK } from '../../../src/cli/output.js';
import { cliHarness } from '../../support/cli.js';
import { uploadFile } from '../../support/uploads.js';

function harness() {
  const cli = cliHarness([addIngestCommand]);
  cli.files.set(
    'sunb.ndjson',
    uploadFile([{ at: '2025-01-14T17:00:00Z', seq: 9 }], { batch: 'up-9' }),
  );
  cli.files.set(
    'bad.ndjson',
    uploadFile([{ at: '2025-01-14T18:00:00Z', seq: 10 }], {
      batch: 'up-10',
      checksum: '00000000',
    }),
  );
  cli.files.set('rubbish.ndjson', 'not an upload');
  return cli;
}

describe('the receipt line', () => {
  it('says what happened in one line', () => {
    const cli = harness();
    cli.run(['ingest', 'sunb.ndjson']);
    expect(cli.output.out[0]).toBe('sunb.ndjson  up-9 ok read 1 stored 1 replaced 0');
  });

  it('marks a batch that has been in before', () => {
    const cli = harness();
    cli.run(['ingest', 'sunb.ndjson']);
    cli.run(['ingest', 'sunb.ndjson']);
    expect(cli.output.text).toContain('already seen');
  });

  it('builds from a receipt alone', () => {
    expect(
      receiptLine({
        batchId: 'up-1',
        accepted: false,
        rowsRead: 4,
        rowsStored: 0,
        rowsReplaced: 0,
        datesTouched: [],
        missingBefore: 0,
        replay: false,
        diagnostics: { bySeverity: () => [] } as never,
      }),
    ).toBe('up-1 REFUSED read 4 stored 0 replaced 0');
  });
});

describe('the ingest command', () => {
  it('takes several files and returns zero', () => {
    const cli = harness();
    expect(cli.run(['ingest', 'sunb.ndjson', 'bad.ndjson'])).toBe(EXIT_OK);
    expect(cli.output.out).toHaveLength(4);
  });

  it('reports a refused batch without failing the run', () => {
    const cli = harness();
    expect(cli.run(['ingest', 'bad.ndjson'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('REFUSED');
    expect(cli.output.text).toContain('1 batches were refused');
  });

  it('stores a refused batch when forced', () => {
    const cli = harness();
    cli.run(['ingest', 'bad.ndjson', '--force']);
    expect(cli.output.text).toContain('stored 1');
  });

  it('prints only the refusals when quiet', () => {
    const cli = harness();
    cli.run(['ingest', 'sunb.ndjson', 'bad.ndjson', '--quiet']);
    expect(cli.output.out.some((line) => line.includes('up-9'))).toBe(false);
    expect(cli.output.out.some((line) => line.includes('up-10'))).toBe(true);
  });

  it('fails the run when a file cannot be read', () => {
    const cli = harness();
    expect(cli.run(['ingest', 'gone.ndjson'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('no such file');
  });

  it('fails the run when a file is not an upload', () => {
    const cli = harness();
    expect(cli.run(['ingest', 'rubbish.ndjson'])).toBe(EXIT_FAILED);
  });

  it('carries on past a bad file to the good ones', () => {
    const cli = harness();
    expect(cli.run(['ingest', 'gone.ndjson', 'sunb.ndjson'])).toBe(EXIT_FAILED);
    expect(cli.output.text).toContain('up-9 ok');
  });

  it('says how many days the store holds afterwards', () => {
    const cli = harness();
    cli.run(['ingest', 'sunb.ndjson']);
    expect(cli.output.text).toContain('the store now holds 2 operating days');
  });

  it('needs at least one file', () => {
    const cli = harness();
    expect(cli.run(['ingest'])).not.toBe(EXIT_OK);
  });
});
