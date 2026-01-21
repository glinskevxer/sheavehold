import { describe, expect, it } from 'vitest';
import { addSeasonCommand, seasonStart } from '../../../../src/cli/commands/season.js';
import { EXIT_FAILED, EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

const harness = () => cliHarness([addSeasonCommand]);

describe('the default start', () => {
  it('is the season opening, not the calendar year', () => {
    expect(seasonStart(harness().app)).toBe('2024-11-22');
  });
});

describe('season summary', () => {
  it('runs from the opening when nobody said otherwise', () => {
    const cli = harness();
    expect(cli.run(['season', 'summary', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('season to date  2024-11-22 to 2025-01-15');
  });

  it('takes an explicit start', () => {
    const cli = harness();
    cli.run(['season', 'summary', '2025-01-15', '--from', '2025-01-13']);
    expect(cli.output.out[0]).toBe('season to date  2025-01-13 to 2025-01-15');
  });

  it('refuses a bad date on either end', () => {
    const cli = harness();
    expect(cli.run(['season', 'summary', 'never'])).toBe(EXIT_FAILED);
    expect(cli.run(['season', 'summary', '2025-01-15', '--from', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('season compare', () => {
  it('prints the comparison against an earlier opening', () => {
    const cli = harness();
    expect(cli.run(['season', 'compare', '2025-01-15', '--against', '2024-11-22'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toContain('season comparison');
  });

  it('will not run without something to compare against', () => {
    const cli = harness();
    expect(cli.run(['season', 'compare', '2025-01-15'])).not.toBe(EXIT_OK);
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['season', 'compare', 'never', '--against', '2024-11-22'])).toBe(EXIT_FAILED);
  });
});

describe('season leaderboard', () => {
  it('prints both lists', () => {
    const cli = harness();
    expect(cli.run(['season', 'leaderboard', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('biggest days');
    expect(cli.output.text).toContain('biggest seasons');
  });

  it('takes a limit', () => {
    const cli = harness();
    expect(cli.run(['season', 'leaderboard', '2025-01-15', '--limit', '1'])).toBe(EXIT_OK);
  });

  it('refuses a limit that is not a count', () => {
    const cli = harness();
    expect(cli.run(['season', 'leaderboard', '2025-01-15', '--limit', 'lots'])).toBe(EXIT_FAILED);
    expect(cli.run(['season', 'leaderboard', '2025-01-15', '--limit', '0'])).toBe(EXIT_FAILED);
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['season', 'leaderboard', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('season products', () => {
  it('prints the product mix', () => {
    const cli = harness();
    expect(cli.run(['season', 'products', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toContain('product mix');
  });

  it('refuses a bad date', () => {
    const cli = harness();
    expect(cli.run(['season', 'products', 'never'])).toBe(EXIT_FAILED);
  });
});
