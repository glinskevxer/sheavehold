import { describe, expect, it } from 'vitest';
import { BUILDERS, emptyApp, main } from '../../../src/cli/entry.js';
import { buildProgram, commandNames } from '../../../src/cli/main.js';
import { CollectedOutput, EXIT_OK } from '../../../src/cli/output.js';

describe('the empty app', () => {
  it('starts with nothing in it', () => {
    const app = emptyApp();
    expect(app.scans.scans.size).toBe(0);
    expect(app.rides.rides.size).toBe(0);
    expect(app.register.size).toBe(0);
    expect(app.lifts.size).toBe(0);
  });

  it('knows its season', () => {
    expect(emptyApp().calendar.season.name).toBe('2024/25');
  });

  it('reads the real clock', () => {
    const before = Date.now();
    expect(emptyApp().now().getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('the command set', () => {
  it('registers every command the area uses', () => {
    const program = buildProgram({
      app: emptyApp(),
      output: new CollectedOutput(),
      builders: BUILDERS,
    });
    expect(commandNames(program)).toEqual([
      'about',
      'day',
      'doctor',
      'exceptions',
      'guest',
      'ingest',
      'lift',
      'replay',
      'revenue',
      'season',
    ]);
  });

  it('has no two commands under one name', () => {
    const names = BUILDERS.map((builder) => builder.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('main', () => {
  it('runs a command against an empty store without falling over', () => {
    expect(main(['about'], emptyApp())).toBe(EXIT_OK);
  });

  it('runs the doctor over an empty store and passes', () => {
    expect(main(['doctor', '--quiet'], emptyApp())).toBe(EXIT_OK);
  });
});
