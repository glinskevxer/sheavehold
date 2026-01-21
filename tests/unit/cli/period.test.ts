import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import {
  readCount,
  readDateArg,
  readPeriodArgs,
  readSeasonPeriod,
} from '../../../src/cli/period.js';
import { CollectedOutput } from '../../../src/cli/output.js';
import { cliHarness } from '../../support/cli.js';

const program = () => new Command();
const app = () => cliHarness([]).app;

describe('reading a date argument', () => {
  it('takes a real date', () => {
    expect(readDateArg('2025-01-13', program(), new CollectedOutput())).toBe('2025-01-13');
  });

  it('names the argument that was wrong and marks the run failed', () => {
    const output = new CollectedOutput();
    const command = program();
    expect(readDateArg('never', command, output, 'from')).toBeUndefined();
    expect(output.errorText.startsWith('from:')).toBe(true);
    expect(command.getOptionValue('failed')).toBe(true);
  });
});

describe('reading a period', () => {
  it('takes two dates in order', () => {
    expect(readPeriodArgs('2025-01-13', '2025-01-15', program(), new CollectedOutput())).toEqual({
      from: '2025-01-13',
      to: '2025-01-15',
    });
  });

  it('allows a single day', () => {
    expect(readPeriodArgs('2025-01-13', '2025-01-13', program(), new CollectedOutput())?.to).toBe(
      '2025-01-13',
    );
  });

  it('refuses a reversed period and says which way round', () => {
    const output = new CollectedOutput();
    expect(readPeriodArgs('2025-01-15', '2025-01-13', program(), output)).toBeUndefined();
    expect(output.errorText).toContain('is before from');
  });

  it('stops at the first bad end', () => {
    const output = new CollectedOutput();
    expect(readPeriodArgs('never', 'also never', program(), output)).toBeUndefined();
    expect(output.err).toHaveLength(1);
  });
});

describe('a season period', () => {
  it('defaults the start to the season opening', () => {
    expect(
      readSeasonPeriod(app(), '2025-01-15', undefined, program(), new CollectedOutput()),
    ).toEqual({ from: '2024-11-22', to: '2025-01-15' });
  });

  it('takes an explicit start', () => {
    expect(
      readSeasonPeriod(app(), '2025-01-15', '2025-01-13', program(), new CollectedOutput())?.from,
    ).toBe('2025-01-13');
  });

  it('refuses a bad end', () => {
    expect(
      readSeasonPeriod(app(), 'never', undefined, program(), new CollectedOutput()),
    ).toBeUndefined();
  });
});

describe('reading a count', () => {
  it('takes a whole number above zero', () => {
    expect(readCount('10', program(), new CollectedOutput())).toBe(10);
  });

  it('refuses anything else and names it', () => {
    const output = new CollectedOutput();
    expect(readCount('lots', program(), output, 'limit')).toBeUndefined();
    expect(readCount('0', program(), output)).toBeUndefined();
    expect(readCount('2.5', program(), output)).toBeUndefined();
    expect(output.errorText).toContain('limit:');
  });
});
