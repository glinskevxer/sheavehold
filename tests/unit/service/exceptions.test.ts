import { describe, expect, it } from 'vitest';
import {
  applyOverride,
  openWorkload,
  scanDateForExceptions,
  type ExceptionScanContext,
} from '../../../src/service/exceptions.js';
import { ExceptionRegister } from '../../../src/domain/exception/register.js';
import { recomputeDate } from '../../../src/service/recompute.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';
import { directory } from '../../support/guests.js';
import { CARD_MILO, CARD_ROW } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';
import { transferMap } from '../../support/transfers.js';

const DECIDED = new Date('2025-01-14T17:00:00Z');

function loaded(specs: readonly { at: string; seq: number; terminal?: string; media?: string }[]) {
  const system = harness();
  system.ingest(specs);
  recomputeDate(day('2025-01-13'), system);
  const context: ExceptionScanContext = {
    rides: system.rides,
    register: new ExceptionRegister(),
    lifts: system.lifts,
    transfers: transferMap(),
    guests: directory(),
  };
  return context;
}

describe('scanning a day', () => {
  it('finds a pass-back and puts it in the register', () => {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:04:00Z', seq: 2 },
    ]);
    const result = scanDateForExceptions(day('2025-01-13'), context);
    expect(result.found).toBe(1);
    expect(result.added).toBe(1);
    expect(context.register.open()).toHaveLength(1);
    expect(result.diagnostics.has('exceptions.found')).toBe(true);
  });

  it('finds an impossible transfer as well', () => {
    const system = harness();
    system.ingest([{ at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'RIDGE.01' }], {
      terminal: 'RIDGE.01',
    });
    system.ingest([{ at: '2025-01-13T17:04:00Z', seq: 1, terminal: 'BOWL.01' }], {
      batch: 'up-2',
      terminal: 'BOWL.01',
    });
    recomputeDate(day('2025-01-13'), system);
    const context: ExceptionScanContext = {
      rides: system.rides,
      register: new ExceptionRegister(),
      lifts: system.lifts,
      transfers: transferMap(),
      guests: directory(),
    };
    const result = scanDateForExceptions(day('2025-01-13'), context);
    expect(result.found).toBe(1);
    expect(context.register.all()[0]?.kind).toBe('impossible_transfer');
  });

  it('finds nothing in a quiet day', () => {
    const context = loaded([{ at: '2025-01-13T17:00:00Z', seq: 1 }]);
    const result = scanDateForExceptions(day('2025-01-13'), context);
    expect(result.found).toBe(0);
    expect(result.diagnostics.length).toBe(0);
  });

  it('is safe to run twice', () => {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:04:00Z', seq: 2 },
    ]);
    scanDateForExceptions(day('2025-01-13'), context);
    const again = scanDateForExceptions(day('2025-01-13'), context);
    expect(again.added).toBe(0);
    expect(again.kept).toBe(1);
    expect(context.register.size).toBe(1);
  });

  it('leaves a finding about one card alone rather than softening it', () => {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1, media: CARD_ROW },
      { at: '2025-01-13T17:04:00Z', seq: 2, media: CARD_ROW },
    ]);
    const result = scanDateForExceptions(day('2025-01-13'), context);
    expect(result.softened).toBe(0);
    expect(context.register.all()[0]?.severity).toBe('high');
  });

  it('finds nothing about a card that was never let on', () => {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1, media: CARD_MILO },
      { at: '2025-01-13T17:04:00Z', seq: 2, media: CARD_MILO },
    ]);
    expect(scanDateForExceptions(day('2025-01-13'), context).found).toBe(0);
  });
});

describe('a supervisor override', () => {
  function withFinding() {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:04:00Z', seq: 2 },
    ]);
    scanDateForExceptions(day('2025-01-13'), context);
    return context;
  }

  it('records what it was before and what it is now', () => {
    const context = withFinding();
    const id = context.register.all()[0]!.id;
    const record = expectOk(
      applyOverride(context.register, {
        exceptionId: id,
        disposition: 'dismissed',
        by: 'ops',
        note: 'family, spoke to them',
        at: DECIDED,
      }),
      'override',
    );
    expect(record).toMatchObject({ from: 'open', to: 'dismissed', by: 'ops' });
    expect(record.note).toBe('family, spoke to them');
    expect(context.register.open()).toEqual([]);
  });

  it('refuses a disposition nobody has heard of', () => {
    const context = withFinding();
    const id = context.register.all()[0]!.id;
    expect(
      isErr(applyOverride(context.register, { exceptionId: id, disposition: 'maybe', by: 'ops' })),
    ).toBe(true);
  });

  it('refuses an exception that is not there and one with nobody behind it', () => {
    const context = withFinding();
    const id = context.register.all()[0]!.id;
    expect(
      isErr(
        applyOverride(context.register, {
          exceptionId: 'nope',
          disposition: 'confirmed',
          by: 'ops',
        }),
      ),
    ).toBe(true);
    expect(
      isErr(
        applyOverride(context.register, { exceptionId: id, disposition: 'confirmed', by: ' ' }),
      ),
    ).toBe(true);
  });

  it('stamps now when nobody said when', () => {
    const context = withFinding();
    const id = context.register.all()[0]!.id;
    const before = Date.now();
    const record = expectOk(
      applyOverride(context.register, { exceptionId: id, disposition: 'referred', by: 'ops' }),
      'override',
    );
    expect(record.at.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('the morning workload', () => {
  it('counts what is open and how much of it is serious', () => {
    const context = loaded([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:04:00Z', seq: 2 },
    ]);
    scanDateForExceptions(day('2025-01-13'), context);
    expect(openWorkload(context.register)).toEqual({ open: 1, high: 1, oldest: '2025-01-13' });
  });

  it('says nothing is open when nothing is', () => {
    expect(openWorkload(new ExceptionRegister())).toEqual({
      open: 0,
      high: 0,
      oldest: undefined,
    });
  });
});
