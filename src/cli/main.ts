import { Command } from 'commander';
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE, type Output } from './output.js';
import type { CliApp } from './app.js';

/**
 * The root command. Commander is used for parsing and for nothing else: it
 * never prints, never exits the process and never touches the app, so the whole
 * command line is a pure function of argv and the injected app.
 */

export const VERSION = '0.9.0';

export type CommandBuilder = (program: Command, app: CliApp, output: Output) => void;

export interface CliOptions {
  readonly app: CliApp;
  readonly output: Output;
  readonly builders: readonly CommandBuilder[];
}

export function buildProgram(options: CliOptions): Command {
  const program = new Command();
  program
    .name('sheavehold')
    .description('lift access gate telemetry for a ski area')
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => options.output.line(text.replace(/\n$/, '')),
      writeErr: (text) => options.output.error(text.replace(/\n$/, '')),
    });
  for (const build of options.builders) build(program, options.app, options.output);
  return program;
}

export function runCli(argv: readonly string[], options: CliOptions): number {
  const program = buildProgram(options);
  try {
    program.parse([...argv], { from: 'user' });
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (
      code === 'commander.version' ||
      code === 'commander.helpDisplayed' ||
      code === 'commander.help'
    ) {
      return EXIT_OK;
    }
    if (code === 'commander.executeSubCommandAsync') return EXIT_OK;
    options.output.error(String((cause as Error).message ?? cause));
    return code === undefined ? EXIT_FAILED : EXIT_USAGE;
  }
  return program.getOptionValue('failed') === true ? EXIT_FAILED : EXIT_OK;
}

/** Commands call this rather than throwing, so the exit code is deliberate. */
export function markFailed(program: Command): void {
  program.setOptionValue('failed', true);
}

export function commandNames(program: Command): string[] {
  return program.commands.map((command) => command.name()).sort();
}
