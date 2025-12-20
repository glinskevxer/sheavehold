import { describe, expect, it } from 'vitest';
import { addReplayCommand } from '../../../src/cli/commands/replay.js';
import { EXIT_FAILED, EXIT_OK } from '../../../src/cli/output.js';
import { ScanStore } from '../../../src/storage/repository/scans.js';
import { cliHarness } from '../../support/cli.js';

const harness = () => cliHarness([addReplayCommand]);
const pair = (out: readonly string[], label: string, value: string) =>
  out.some((line) => line.startsWith(label) && line.trim().endsWith(value));

describe('replay day', () => {
  it('restates and rebuilds one day', () => {
    const cli = harness();
    expect(cli.run(['replay', 'day', '2025-01-13'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('days rebuilt');
    expect(pair(cli.output.out, 'rides', '4')).toBe(true);
  });

  it('leaves the store the same when nothing has changed', () => {
    const cli = harness();
    cli.run(['replay', 'day', '2025-01-13']);
    expect(cli.app.rides.rides.size).toBe(4);
    expect(pair(cli.output.out, 'moved day', '0')).toBe(true);
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['replay', 'day', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('replay period', () => {
  it('restates the whole store and rebuilds the period', () => {
    const cli = harness();
    expect(cli.run(['replay', 'period', '2025-01-13', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('replayed 2025-01-13 to 2025-01-15');
    expect(cli.output.text).toContain('scans restated');
    expect(cli.output.text).toContain('visits');
  });

  it('rebuilds every day in the period even the quiet ones', () => {
    const cli = harness();
    cli.run(['replay', 'period', '2025-01-13', '2025-01-15']);
    expect(pair(cli.output.out, 'days rebuilt', '3')).toBe(true);
  });

  it('refuses a bad or reversed period', () => {
    const cli = harness();
    expect(cli.run(['replay', 'period', 'never', '2025-01-15'])).toBe(EXIT_FAILED);
    expect(cli.run(['replay', 'period', '2025-01-15', '2025-01-13'])).toBe(EXIT_FAILED);
  });
});

describe('replay all', () => {
  it('rebuilds every day on file', () => {
    const cli = harness();
    expect(cli.run(['replay', 'all'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('rebuilt 1 days from 4 scans');
  });

  it('says what would move without rebuilding on a dry run', () => {
    const cli = harness();
    expect(cli.run(['replay', 'all', '--dry-run'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('0 scans would move day');
    expect(cli.output.text).toContain('1 days would be rebuilt');
  });

  it('refuses when the store holds nothing', () => {
    const cli = harness();
    (cli.app as { scans: ScanStore }).scans = new ScanStore();
    expect(cli.run(['replay', 'all'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('no scans');
  });
});
