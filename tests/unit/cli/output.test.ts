import { describe, expect, it } from 'vitest';
import {
  CollectedOutput,
  EXIT_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  streamOutput,
} from '../../../src/cli/output.js';

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

  it('starts empty', () => {
    const output = new CollectedOutput();
    expect(output.text).toBe('');
    expect(output.errorText).toBe('');
  });

  it('takes an empty list of lines without printing anything', () => {
    const output = new CollectedOutput();
    output.lines([]);
    expect(output.out).toEqual([]);
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

  it('writes a bare newline for a blank line', () => {
    const written: string[] = [];
    streamOutput(
      (text) => written.push(text),
      () => undefined,
    ).line();
    expect(written).toEqual(['\n']);
  });
});

describe('the exit codes', () => {
  it('are the three the shell scripts check for', () => {
    expect(EXIT_OK).toBe(0);
    expect(EXIT_FAILED).toBe(1);
    expect(EXIT_USAGE).toBe(2);
  });
});
