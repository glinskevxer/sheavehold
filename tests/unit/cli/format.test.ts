import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import {
  emit,
  FORMATS,
  formatsOf,
  isFormat,
  readFormat,
  withFormat,
  type Rendered,
} from '../../../src/cli/format.js';
import { CollectedOutput } from '../../../src/cli/output.js';

const rendered: Rendered = {
  text: ['a report', 'with lines'],
  json: { rides: 4 },
  csv: { header: ['lift', 'rides'], rows: [{ lift: 'SUNB', rides: '3' }] },
};

describe('the format list', () => {
  it('recognises the three we write', () => {
    expect(FORMATS).toEqual(['text', 'json', 'csv']);
    expect(isFormat('csv')).toBe(true);
    expect(isFormat('pdf')).toBe(false);
  });
});

describe('reading the flag', () => {
  it('takes a format the command supports', () => {
    const output = new CollectedOutput();
    expect(readFormat('json', ['text', 'json'], new Command(), output)).toBe('json');
    expect(output.errorText).toBe('');
  });

  it('refuses a format nobody writes', () => {
    const output = new CollectedOutput();
    expect(readFormat('pdf', ['text'], new Command(), output)).toBeUndefined();
    expect(output.errorText).toContain('is not a format');
  });

  it('refuses a real format this command cannot produce', () => {
    const output = new CollectedOutput();
    expect(readFormat('csv', ['text', 'json'], new Command(), output)).toBeUndefined();
    expect(output.errorText).toContain('does not write csv');
  });

  it('marks the run failed rather than carrying on', () => {
    const program = new Command();
    readFormat('pdf', ['text'], program, new CollectedOutput());
    expect(program.getOptionValue('failed')).toBe(true);
  });
});

describe('emitting', () => {
  it('prints the lines for text', () => {
    const output = new CollectedOutput();
    expect(emit('text', rendered, output)).toBe(true);
    expect(output.out).toEqual(['a report', 'with lines']);
  });

  it('prints indented json', () => {
    const output = new CollectedOutput();
    emit('json', rendered, output);
    expect(JSON.parse(output.text)).toEqual({ rides: 4 });
    expect(output.out.length).toBeGreaterThan(1);
  });

  it('prints a csv table with its header', () => {
    const output = new CollectedOutput();
    emit('csv', rendered, output);
    expect(output.out).toEqual(['lift,rides', 'SUNB,3']);
  });

  it('says it could not when the command produced nothing of that shape', () => {
    const output = new CollectedOutput();
    expect(emit('csv', { text: ['a'] }, output)).toBe(false);
    expect(emit('json', { text: ['a'] }, output)).toBe(false);
    expect(emit('text', { json: {} }, output)).toBe(false);
    expect(output.out).toEqual([]);
  });
});

describe('the flag on a command', () => {
  it('defaults to text and lists what the command writes', () => {
    const command = withFormat(new Command('day'), ['text', 'json']);
    const option = command.options.find((entry) => entry.long === '--format');
    expect(option?.defaultValue).toBe('text');
    expect(option?.description).toBe('one of text, json');
  });

  it('reads which formats a rendered value can produce', () => {
    expect(formatsOf(rendered)).toEqual(['text', 'json', 'csv']);
    expect(formatsOf({ text: ['a'] })).toEqual(['text']);
    expect(formatsOf({})).toEqual([]);
  });
});
