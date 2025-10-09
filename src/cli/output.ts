/**
 * Nothing in the command layer writes to the console directly. Every command
 * takes a sink, which in production is stdout and in a test is an array, so a
 * test can assert on what a command printed without capturing a stream.
 *
 * That sounds fussy for a command line tool. It stopped a whole class of test
 * that passed while printing nothing, which is what happened before.
 */

export interface Output {
  line(text?: string): void;
  error(text: string): void;
  lines(values: readonly string[]): void;
}

export class CollectedOutput implements Output {
  readonly out: string[] = [];
  readonly err: string[] = [];

  line(text = ''): void {
    this.out.push(text);
  }

  error(text: string): void {
    this.err.push(text);
  }

  lines(values: readonly string[]): void {
    for (const value of values) this.out.push(value);
  }

  get text(): string {
    return this.out.join('\n');
  }

  get errorText(): string {
    return this.err.join('\n');
  }
}

export function streamOutput(
  write: (text: string) => void,
  writeError: (text: string) => void,
): Output {
  return {
    line(text = '') {
      write(`${text}\n`);
    },
    error(text) {
      writeError(`${text}\n`);
    },
    lines(values) {
      write(values.length === 0 ? '' : `${values.join('\n')}\n`);
    },
  };
}

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
