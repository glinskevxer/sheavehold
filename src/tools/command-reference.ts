import type { Command } from 'commander';

/**
 * The command reference in `docs/` is generated from the program, so it cannot
 * describe a flag that no longer exists. It did, for a whole season: the day
 * command grew a `--rebuild` and lost a `--since`, and the hand written page
 * kept both for months.
 */

export interface CommandDoc {
  readonly path: string;
  readonly description: string;
  readonly args: readonly { name: string; description: string; required: boolean }[];
  readonly options: readonly { flags: string; description: string; default: string | undefined }[];
}

function describeOne(command: Command, prefix: string): CommandDoc {
  const path = prefix === '' ? command.name() : `${prefix} ${command.name()}`;
  return {
    path,
    description: command.description(),
    args: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      description: argument.description,
      required: argument.required,
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description,
      default: option.defaultValue === undefined ? undefined : String(option.defaultValue),
    })),
  };
}

export function describeCommands(program: Command, prefix = ''): CommandDoc[] {
  const out: CommandDoc[] = [];
  for (const command of program.commands) {
    const path = prefix === '' ? command.name() : `${prefix} ${command.name()}`;
    if (command.commands.length > 0) {
      out.push(describeOne(command, prefix));
      out.push(...describeCommands(command, path));
      continue;
    }
    out.push(describeOne(command, prefix));
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function renderCommandReference(program: Command): string {
  const lines: string[] = ['# command reference', ''];
  lines.push('Generated from the program. Do not edit by hand.', '');
  for (const command of describeCommands(program)) {
    lines.push(`## \`sheavehold ${command.path}\``, '');
    if (command.description !== '') lines.push(command.description, '');
    if (command.args.length > 0) {
      lines.push('| argument | required | what it is |');
      lines.push('| --- | --- | --- |');
      for (const argument of command.args) {
        lines.push(
          `| \`${argument.name}\` | ${argument.required ? 'yes' : 'no'} | ${argument.description} |`,
        );
      }
      lines.push('');
    }
    if (command.options.length > 0) {
      lines.push('| option | default | what it does |');
      lines.push('| --- | --- | --- |');
      for (const option of command.options) {
        const fallback = option.default === undefined ? '' : `\`${option.default}\``;
        lines.push(`| \`${option.flags}\` | ${fallback} | ${option.description} |`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Commands with no description, which is the one thing a generator cannot fix. */
export function undocumented(program: Command): string[] {
  return describeCommands(program)
    .filter((command) => command.description.trim() === '')
    .map((command) => command.path);
}
