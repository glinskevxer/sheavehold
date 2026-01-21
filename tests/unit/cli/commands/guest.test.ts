import { describe, expect, it } from 'vitest';
import { addGuestCommand, resolveGuestId } from '../../../../src/cli/commands/guest.js';
import { EXIT_FAILED, EXIT_OK } from '../../../../src/cli/output.js';
import { cliHarness } from '../../../support/cli.js';

const harness = () => cliHarness([addGuestCommand]);

describe('finding the guest behind an identifier', () => {
  it('takes a guest id straight', () => {
    expect(resolveGuestId(harness().app, 'G-77')).toBe('G-77');
  });

  it('takes the number printed on a card', () => {
    expect(resolveGuestId(harness().app, '4021-8830-1174')).toBe('G-77');
  });

  it('takes a tag serial off a reader', () => {
    expect(resolveGuestId(harness().app, 'E2004A1B00000456')).toBe('G-78');
  });

  it('answers nothing for something it does not recognise', () => {
    expect(resolveGuestId(harness().app, 'who')).toBeUndefined();
    expect(resolveGuestId(harness().app, '9999-9999-9999')).toBeUndefined();
    expect(resolveGuestId(harness().app, 'E2004A1B0000FFFF')).toBeUndefined();
  });
});

describe('guest show', () => {
  it('prints the guest, their season and what they hold', () => {
    const cli = harness();
    expect(cli.run(['guest', 'show', 'G-77'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('G-77 Ardley, Row');
    expect(
      cli.output.out.some((line) => line.startsWith('age band') && line.includes('adult')),
    ).toBe(true);
    expect(
      cli.output.out.some((line) => line.startsWith('household') && line.includes('HH-1')),
    ).toBe(true);
    expect(cli.output.text).toContain('ENT-1001');
    expect(cli.output.text).toContain('Season Pass');
  });

  it('shows an unlimited pass as having many days left', () => {
    const cli = harness();
    cli.run(['guest', 'show', 'G-77']);
    expect(cli.output.text).toContain('many');
  });

  it('counts a ticket down', () => {
    const cli = harness();
    cli.run(['guest', 'show', 'G-78']);
    expect(cli.output.text).toContain('A3DAY');
    expect(cli.output.text).toContain('Adult Three Day');
  });

  it('says when they were last out', () => {
    const cli = harness();
    cli.run(['guest', 'show', 'G-77']);
    expect(cli.output.text).toContain('last out 2025-01-13');
  });

  it('works from a printed card number', () => {
    const cli = harness();
    expect(cli.run(['guest', 'show', '4021-8830-1174'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('Ardley, Row');
  });

  it('says so when nobody matches', () => {
    const cli = harness();
    expect(cli.run(['guest', 'show', 'who'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('nothing on file for who');
  });

  it('prints a guest who has never skied without falling over', () => {
    const cli = harness();
    expect(cli.run(['guest', 'show', 'G-93'])).toBe(EXIT_OK);
    expect(
      cli.output.out.some((line) => line.startsWith('age band') && line.includes('unknown')),
    ).toBe(true);
    expect(
      cli.output.out.some((line) => line.startsWith('household') && line.includes('none')),
    ).toBe(true);
    expect(
      cli.output.out.some((line) => line.startsWith('favourite lift') && line.includes('none')),
    ).toBe(true);
  });

  it('takes an as of date for the age band', () => {
    const cli = harness();
    expect(cli.run(['guest', 'show', 'G-79', '--as-of', '2025-02-01'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('adult');
  });
});

describe('guest household', () => {
  it('prints everybody on the account', () => {
    const cli = harness();
    expect(cli.run(['guest', 'household', 'HH-1'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('household HH-1');
    expect(cli.output.text).toContain('G-77');
    expect(cli.output.text).toContain('G-79');
  });

  it('says so when nobody is on it', () => {
    const cli = harness();
    expect(cli.run(['guest', 'household', 'HH-9'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('nobody is on household HH-9');
  });
});
