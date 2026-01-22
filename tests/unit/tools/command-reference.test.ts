import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import {
  describeCommands,
  renderCommandReference,
  undocumented,
} from '../../../src/tools/command-reference.js';
import { buildProgram } from '../../../src/cli/main.js';
import { BUILDERS, emptyApp } from '../../../src/cli/entry.js';
import { CollectedOutput } from '../../../src/cli/output.js';

function program(): Command {
  return buildProgram({ app: emptyApp(), output: new CollectedOutput(), builders: BUILDERS });
}

describe('describing the commands', () => {
  it('lists every command and every subcommand', () => {
    const paths = describeCommands(program()).map((command) => command.path);
    expect(paths).toContain('about');
    expect(paths).toContain('lift');
    expect(paths).toContain('lift show');
    expect(paths).toContain('season leaderboard');
  });

  it('lists them in order', () => {
    const paths = describeCommands(program()).map((command) => command.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('carries the arguments with whether they are required', () => {
    const day = describeCommands(program()).find((command) => command.path === 'day');
    expect(day?.args).toEqual([
      { name: 'date', description: 'operating date, YYYY-MM-DD', required: true },
    ]);
  });

  it('carries the options with their defaults', () => {
    const day = describeCommands(program()).find((command) => command.path === 'day');
    const format = day?.options.find((option) => option.flags.startsWith('--format'));
    expect(format?.default).toBe('text');
    const rebuild = day?.options.find((option) => option.flags === '--rebuild');
    expect(rebuild?.default).toBeUndefined();
  });

  it('gives a command with no arguments an empty list', () => {
    const about = describeCommands(program()).find((command) => command.path === 'about');
    expect(about?.args).toEqual([]);
    expect(about?.options).toEqual([]);
  });
});

describe('the generated page', () => {
  it('opens with a heading and a warning', () => {
    const text = renderCommandReference(program());
    expect(text.startsWith('# command reference')).toBe(true);
    expect(text).toContain('Do not edit by hand');
  });

  it('has a section for every command', () => {
    const text = renderCommandReference(program());
    for (const command of describeCommands(program())) {
      expect(text).toContain(`## \`sheavehold ${command.path}\``);
    }
  });

  it('writes the argument and option tables', () => {
    const text = renderCommandReference(program());
    expect(text).toContain('| argument | required | what it is |');
    expect(text).toContain('| `--rebuild` |  | recompute the day before printing it |');
  });

  it('ends with a newline', () => {
    expect(renderCommandReference(program()).endsWith('\n')).toBe(true);
  });

  it('writes nothing but the heading for an empty program', () => {
    expect(renderCommandReference(new Command())).toContain('# command reference');
  });
});

describe('finding what is undocumented', () => {
  it('finds nothing in the real program', () => {
    expect(undocumented(program())).toEqual([]);
  });

  it('names a command nobody described', () => {
    const bare = new Command();
    bare.command('mystery');
    expect(undocumented(bare)).toEqual(['mystery']);
  });
});
