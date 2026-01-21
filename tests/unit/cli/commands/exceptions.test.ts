import { describe, expect, it } from 'vitest';
import { addExceptionsCommand } from '../../../../src/cli/commands/exceptions.js';
import { EXIT_FAILED, EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

function harness() {
  const cli = cliHarness([addExceptionsCommand]);
  return { cli, id: cli.app.register.all()[0]?.id ?? '' };
}

describe('exceptions list', () => {
  it('prints the register over a period', () => {
    const { cli } = harness();
    expect(cli.run(['exceptions', 'list', '2025-01-13', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('exception register  2025-01-13 to 2025-01-15');
    expect(cli.output.text).toContain('passback');
  });

  it('says so when there is nothing in the period', () => {
    const { cli } = harness();
    cli.run(['exceptions', 'list', '2025-02-01', '2025-02-03']);
    expect(cli.output.text).toContain('nothing to look at');
  });

  it('filters to the open findings', () => {
    const { cli, id } = harness();
    cli.run(['exceptions', 'decide', id, 'dismissed', '--by', 'ops']);
    cli.run(['exceptions', 'list', '2025-01-13', '2025-01-15', '--open']);
    expect(cli.output.text).toContain('nothing to look at');
  });

  it('refuses a bad period', () => {
    const { cli } = harness();
    expect(cli.run(['exceptions', 'list', 'never', '2025-01-15'])).toBe(EXIT_FAILED);
    expect(cli.run(['exceptions', 'list', '2025-01-13', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('exceptions scan', () => {
  it('runs the rules again and says what changed', () => {
    const { cli } = harness();
    expect(cli.run(['exceptions', 'scan', '2025-01-13'])).toBe(EXIT_OK);
    expect(cli.output.out.some((line) => line.startsWith('found') && line.includes('1'))).toBe(
      true,
    );
    expect(
      cli.output.out.some((line) => line.startsWith('already known') && line.includes('1')),
    ).toBe(true);
  });

  it('refuses a bad date', () => {
    const { cli } = harness();
    expect(cli.run(['exceptions', 'scan', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('exceptions decide', () => {
  it('records the decision and what it was before', () => {
    const { cli, id } = harness();
    expect(cli.run(['exceptions', 'decide', id, 'confirmed', '--by', 'ops'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toContain('went from open to confirmed, by ops');
    expect(cli.app.register.open()).toEqual([]);
  });

  it('keeps a note when one is given', () => {
    const { cli, id } = harness();
    cli.run(['exceptions', 'decide', id, 'dismissed', '--by', 'ops', '--note', 'family']);
    expect(cli.app.register.get(id)?.note).toBe('family');
  });

  it('refuses a disposition nobody has heard of', () => {
    const { cli, id } = harness();
    expect(cli.run(['exceptions', 'decide', id, 'maybe', '--by', 'ops'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('not a disposition');
  });

  it('refuses a finding that is not there', () => {
    const { cli } = harness();
    expect(cli.run(['exceptions', 'decide', 'nope', 'confirmed', '--by', 'ops'])).toBe(EXIT_FAILED);
  });

  it('will not run without a name behind it', () => {
    const { cli, id } = harness();
    expect(cli.run(['exceptions', 'decide', id, 'confirmed'])).not.toBe(EXIT_OK);
  });
});
