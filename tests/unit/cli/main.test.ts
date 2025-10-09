import { describe, expect, it } from 'vitest';
import { addAboutCommand } from '../../../src/cli/commands/version.js';
import { buildProgram, commandNames, VERSION } from '../../../src/cli/main.js';
import { CollectedOutput, EXIT_OK, EXIT_USAGE, streamOutput } from '../../../src/cli/output.js';
import { cliHarness } from '../../support/cli.js';

const harness = () => cliHarness([addAboutCommand]);

describe('the collected output', () => {
  it('keeps what was printed and what went to the error stream', () => {
    const output = new CollectedOutput();
    output.line('one');
    output.lines(['two', 'three']);
    output.error('bad');
    expect(output.text).toBe('one\ntwo\nthree');
    expect(output.errorText).toBe('bad');
  });

  it('prints a blank line when asked for nothing', () => {
    const output = new CollectedOutput();
    output.line();
    expect(output.out).toEqual(['']);
  });
});

describe('the stream output', () => {
  it('writes a trailing newline on each call', () => {
    const written: string[] = [];
    const errors: string[] = [];
    const output = streamOutput(
      (text) => written.push(text),
      (text) => errors.push(text),
    );
    output.line('one');
    output.lines(['two', 'three']);
    output.lines([]);
    output.error('bad');
    expect(written).toEqual(['one\n', 'two\nthree\n', '']);
    expect(errors).toEqual(['bad\n']);
  });
});

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

describe('about', () => {
  it('prints what the build is and what it holds', () => {
    const cli = harness();
    cli.run(['about']);
    expect(cli.output.out[0]).toBe(`sheavehold ${VERSION}`);
    expect(cli.output.text).toContain('season 2024/25');
    expect(cli.output.text).toContain('lifts 7, terminals 10');
    expect(cli.output.text).toContain('scans 4, rides 4');
    expect(cli.output.text).toContain('open exceptions 1');
  });
});
