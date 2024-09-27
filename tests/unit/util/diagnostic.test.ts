import { describe, expect, it } from 'vitest';
import {
  compareSeverity,
  DiagnosticBag,
  formatDiagnostic,
  formatSource,
  SheaveholdError,
} from '../../../src/util/diagnostic.js';

describe('diagnostics', () => {
  it('ranks the severities', () => {
    expect(compareSeverity('error', 'warning')).toBeGreaterThan(0);
    expect(compareSeverity('info', 'warning')).toBeLessThan(0);
    expect(compareSeverity('error', 'error')).toBe(0);
  });

  it('prints the place a row came from', () => {
    expect(formatSource({ batch: 'up-441', file: 'gate.ndjson', line: 12 })).toBe(
      'up-441 gate.ndjson line 12',
    );
    expect(formatSource({ line: 12 })).toBe('line 12');
    expect(formatSource(undefined)).toBe('');
  });

  it('formats an entry with and without a source', () => {
    expect(
      formatDiagnostic({
        code: 'scan.unknown_media',
        severity: 'warning',
        message: 'media E2004A1B00000123 is not on file',
        source: { file: 'gate.ndjson', line: 8 },
      }),
    ).toBe(
      'warning scan.unknown_media: media E2004A1B00000123 is not on file (gate.ndjson line 8)',
    );
    expect(
      formatDiagnostic({ code: 'batch.empty', severity: 'info', message: 'nothing to do' }),
    ).toBe('info batch.empty: nothing to do');
  });
});

describe('the bag', () => {
  it('collects at three severities and knows the worst', () => {
    const bag = new DiagnosticBag();
    expect(bag.worst()).toBeUndefined();
    bag.info('batch.received', 'four thousand rows');
    expect(bag.worst()).toBe('info');
    bag.warn('scan.clock_drift', 'terminal is nine seconds ahead');
    expect(bag.worst()).toBe('warning');
    bag.error('batch.checksum', 'the checksum does not match');
    expect(bag.worst()).toBe('error');
    expect(bag.length).toBe(3);
    expect(bag.hasErrors()).toBe(true);
  });

  it('finds an entry by code', () => {
    const bag = new DiagnosticBag();
    bag.warn('scan.clock_drift', 'ahead');
    expect(bag.has('scan.clock_drift')).toBe(true);
    expect(bag.has('scan.unknown_media')).toBe(false);
  });

  it('filters by severity and keeps the order', () => {
    const bag = new DiagnosticBag();
    bag.warn('a', 'first');
    bag.error('b', 'second');
    bag.warn('c', 'third');
    expect(bag.bySeverity('warning').map((entry) => entry.code)).toEqual(['a', 'c']);
    expect(bag.bySeverity('error')).toHaveLength(1);
  });

  it('leaves the optional fields off when they were not given', () => {
    const bag = new DiagnosticBag();
    bag.warn('a', 'no context');
    const entry = bag.all()[0]!;
    expect('context' in entry).toBe(false);
    expect('source' in entry).toBe(false);
  });

  it('keeps the context and the source when they were', () => {
    const bag = new DiagnosticBag();
    bag.error('scan.rejected', 'no entitlement', { media: 'E2004A1B00000123' }, { line: 4 });
    const entry = bag.all()[0]!;
    expect(entry.context).toEqual({ media: 'E2004A1B00000123' });
    expect(entry.source).toEqual({ line: 4 });
  });

  it('tallies by code', () => {
    const bag = new DiagnosticBag();
    bag.warn('scan.duplicate', 'one');
    bag.warn('scan.duplicate', 'two');
    bag.error('batch.checksum', 'three');
    expect([...bag.tally()]).toEqual([
      ['scan.duplicate', 2],
      ['batch.checksum', 1],
    ]);
  });

  it('merges another bag in without losing order', () => {
    const first = new DiagnosticBag();
    first.info('a', 'one');
    const second = new DiagnosticBag();
    second.warn('b', 'two');
    second.warn('c', 'three');
    first.merge(second);
    expect(first.all().map((entry) => entry.code)).toEqual(['a', 'b', 'c']);
  });

  it('formats and clears', () => {
    const bag = new DiagnosticBag();
    bag.warn('a', 'one', undefined, { line: 3 });
    expect(bag.format()).toEqual(['warning a: one (line 3)']);
    bag.clear();
    expect(bag.length).toBe(0);
    expect(bag.format()).toEqual([]);
  });

  it('adds a prebuilt entry', () => {
    const bag = new DiagnosticBag();
    bag.add({ code: 'x', severity: 'error', message: 'prebuilt' });
    expect(bag.hasErrors()).toBe(true);
  });
});

describe('the thrown error', () => {
  it('carries a code and a context', () => {
    const error = new SheaveholdError('lift.unknown', 'no lift SUNB', { lift: 'SUNB' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SheaveholdError');
    expect(error.code).toBe('lift.unknown');
    expect(error.message).toBe('no lift SUNB');
    expect(error.context).toEqual({ lift: 'SUNB' });
  });

  it('defaults the context to nothing', () => {
    expect(new SheaveholdError('a', 'b').context).toEqual({});
  });
});
