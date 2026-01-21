import { describe, expect, it } from 'vitest';
import { addAboutCommand } from '../../../../src/cli/commands/version.js';
import { VERSION } from '../../../../src/cli/main.js';
import { EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

const harness = () => cliHarness([addAboutCommand]);

describe('about', () => {
  it('prints the build and what it holds', () => {
    const cli = harness();
    expect(cli.run(['about'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe(`sheavehold ${VERSION}`);
    expect(cli.output.text).toContain('season 2024/25');
    expect(cli.output.text).toContain('lifts 7, terminals 10');
    expect(cli.output.text).toContain('scans 4, rides 4');
    expect(cli.output.text).toContain('open exceptions 1');
  });

  it('prints five lines and nothing else', () => {
    const cli = harness();
    cli.run(['about']);
    expect(cli.output.out).toHaveLength(5);
    expect(cli.output.errorText).toBe('');
  });
});
