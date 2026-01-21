import { describe, expect, it } from 'vitest';
import { addAboutCommand } from '../../../src/cli/commands/version.js';
import { buildProgram, commandNames, VERSION } from '../../../src/cli/main.js';
import { CollectedOutput, EXIT_OK, EXIT_USAGE } from '../../../src/cli/output.js';
import { cliHarness } from '../../support/cli.js';

const harness = () => cliHarness([addAboutCommand]);

describe('the root command', () => {
  it('carries a name and a version', () => {
    const built = buildProgram({ app: harness().app, output: new CollectedOutput(), builders: [] });
    expect(built.name()).toBe('sheavehold');
    expect(built.version()).toBe(VERSION);
  });

  it('registers the commands it was given', () => {
    const built = buildProgram({
      app: harness().app,
      output: new CollectedOutput(),
      builders: [addAboutCommand],
    });
    expect(commandNames(built)).toEqual(['about']);
  });

  it('returns zero for a command that worked', () => {
    const cli = harness();
    expect(cli.run(['about'])).toBe(EXIT_OK);
  });

  it('returns zero for help and version rather than treating them as failures', () => {
    const cli = harness();
    expect(cli.run(['--help'])).toBe(EXIT_OK);
    expect(cli.run(['--version'])).toBe(EXIT_OK);
  });

  it('returns a usage code for a command nobody has', () => {
    const cli = harness();
    expect(cli.run(['fly'])).toBe(EXIT_USAGE);
    expect(cli.output.errorText).toContain('fly');
  });
});
