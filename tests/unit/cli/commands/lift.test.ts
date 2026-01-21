import { describe, expect, it } from 'vitest';
import { addLiftCommand } from '../../../../src/cli/commands/lift.js';
import { EXIT_FAILED, EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

const harness = () => cliHarness([addLiftCommand]);

describe('lift day', () => {
  it('prints a row for every lift', () => {
    const cli = harness();
    expect(cli.run(['lift', 'day', '2025-01-13'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('lifts on 2025-01-13');
    expect(cli.output.text).toContain('SUNB');
    expect(cli.output.text).toContain('North Bowl');
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['lift', 'day', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('lift show', () => {
  it('prints the lift record and the hours', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'SUNB', '2025-01-13'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('SUNB Sunburst');
    expect(cli.output.text).toContain('1240 ft');
    expect(cli.output.text).toContain('2400 an hour');
    expect(cli.output.text).toContain('10:00');
  });

  it('says when there are not enough laps to infer a ride time', () => {
    const cli = harness();
    cli.run(['lift', 'show', 'SUNB', '2025-01-13']);
    expect(cli.output.text).toContain('not enough laps to say');
  });

  it('folds a lower case lift code', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'sunb', '2025-01-13'])).toBe(EXIT_OK);
  });

  it('refuses a lift code that is not one', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'S1', '2025-01-13'])).toBe(EXIT_FAILED);
  });

  it('refuses a lift nobody has on file', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'GHOST', '2025-01-13'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('no lift GHOST');
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'SUNB', 'never'])).toBe(EXIT_FAILED);
  });

  it('prints a lift that did not turn without falling over', () => {
    const cli = harness();
    expect(cli.run(['lift', 'show', 'BOWL', '2025-01-13'])).toBe(EXIT_OK);
    const ridesLine = cli.output.out.find((line) => line.startsWith('rides'));
    expect(ridesLine?.trim().split(/\s+/)).toEqual(['rides', '0']);
  });
});

describe('lift utilisation', () => {
  it('prints the report over a period', () => {
    const cli = harness();
    expect(cli.run(['lift', 'utilisation', '2025-01-13', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('lift utilisation  2025-01-13 to 2025-01-15');
    expect(cli.output.text).toContain('70% of design capacity');
  });

  it('takes a different threshold', () => {
    const cli = harness();
    cli.run(['lift', 'utilisation', '2025-01-13', '2025-01-15', '--threshold', '5']);
    expect(cli.output.text).toContain('5% of design capacity');
  });

  it('refuses a threshold that is not a number', () => {
    const cli = harness();
    expect(
      cli.run(['lift', 'utilisation', '2025-01-13', '2025-01-15', '--threshold', 'lots']),
    ).toBe(EXIT_FAILED);
  });

  it('refuses a bad period', () => {
    const cli = harness();
    expect(cli.run(['lift', 'utilisation', 'never', '2025-01-15'])).toBe(EXIT_FAILED);
    expect(cli.run(['lift', 'utilisation', '2025-01-13', 'never'])).toBe(EXIT_FAILED);
  });
});
