import { describe, expect, it } from 'vitest';
import { addDayCommand } from '../../../../src/cli/commands/day.js';
import { EXIT_FAILED, EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

const harness = () => cliHarness([addDayCommand]);

describe('printing a day', () => {
  it('prints the sheet by default', () => {
    const cli = harness();
    expect(cli.run(['day', '2025-01-13'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('sheavehold daily operations  2025-01-13');
    expect(cli.output.text).toContain('lifts');
  });

  it('prints json when asked', () => {
    const cli = harness();
    cli.run(['day', '2025-01-13', '--format', 'json']);
    const parsed = JSON.parse(cli.output.text) as { date: string; version: number };
    expect(parsed).toMatchObject({ date: '2025-01-13', version: 2 });
  });

  it('prints csv when asked', () => {
    const cli = harness();
    cli.run(['day', '2025-01-13', '--format', 'csv']);
    expect(cli.output.out[0]?.startsWith('date,status')).toBe(true);
    expect(cli.output.out).toHaveLength(2);
  });

  it('refuses a format nobody serves', () => {
    const cli = harness();
    expect(cli.run(['day', '2025-01-13', '--format', 'pdf'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('not a format');
  });

  it('refuses a date that is not a date', () => {
    const cli = harness();
    expect(cli.run(['day', 'yesterday'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('YYYY-MM-DD');
  });

  it('prints a quiet day rather than complaining', () => {
    const cli = harness();
    expect(cli.run(['day', '2025-01-20'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('2025-01-20');
  });
});

describe('rebuilding before printing', () => {
  it('says what it rebuilt and then prints', () => {
    const cli = harness();
    expect(cli.run(['day', '2025-01-13', '--rebuild'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('rebuilt 2025-01-13 to 4 rides');
    expect(cli.output.text).toContain('daily operations');
  });

  it('leaves the store consistent when run twice', () => {
    const cli = harness();
    cli.run(['day', '2025-01-13', '--rebuild']);
    cli.run(['day', '2025-01-13', '--rebuild']);
    expect(cli.app.rides.rides.size).toBe(4);
  });
});

describe('writing to a file', () => {
  it('writes the body and says where it went', () => {
    const cli = harness();
    cli.run(['day', '2025-01-13', '--out', 'day.txt']);
    expect(cli.output.out).toEqual(['wrote day.txt']);
    expect(cli.files.get('day.txt')?.startsWith(' ')).toBe(true);
    expect(cli.files.get('day.txt')?.endsWith('\n')).toBe(true);
  });

  it('writes json to a file too', () => {
    const cli = harness();
    cli.run(['day', '2025-01-13', '--format', 'json', '--out', 'day.json']);
    expect(JSON.parse(cli.files.get('day.json') ?? '')).toMatchObject({ date: '2025-01-13' });
  });
});
