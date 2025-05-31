import { describe, expect, it } from 'vitest';
import {
  ExceptionRegister,
  exceptionKey,
  fromPassback,
  fromTransfer,
  isDisposition,
  type ExceptionRow,
} from '../../../../src/domain/exception/register.js';
import { findSameLiftPassbacks } from '../../../../src/domain/exception/passback.js';
import { findImpossibleTransfers } from '../../../../src/domain/exception/transfer.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { transferMap } from '../../../support/transfers.js';
import { day } from '../../../support/season.js';

function at(minutes: number, terminal: string): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), terminal };
}

const DECIDED = new Date('2025-01-14T17:00:00Z');

function passbackRows(): ExceptionRow[] {
  const rides = ridesFrom([at(0, 'SUNB.01'), at(4, 'SUNB.01')]);
  return findSameLiftPassbacks(rides, { lifts: lifts() }).map((finding) =>
    fromPassback(finding, day('2025-01-13')),
  );
}

describe('turning a finding into a row', () => {
  it('describes a pass-back and grades it', () => {
    const row = passbackRows()[0]!;
    expect(row.kind).toBe('passback_same_lift');
    expect(row.severity).toBe('high');
    expect(row.disposition).toBe('open');
    expect(row.detail).toContain('minimum lap');
    expect(row.evidence).toHaveLength(2);
  });

  it('grades a slower pass-back lower', () => {
    const rides = ridesFrom([at(0, 'SUNB.01'), at(9, 'SUNB.01')]);
    const row = fromPassback(
      findSameLiftPassbacks(rides, { lifts: lifts() })[0]!,
      day('2025-01-13'),
    );
    expect(row.severity).toBe('low');
  });

  it('describes an impossible transfer', () => {
    const rides = ridesFrom([at(0, 'RIDGE.01'), at(4, 'BOWL.01')]);
    const finding = findImpossibleTransfers(rides, {
      lifts: lifts(),
      transfers: transferMap(),
    })[0]!;
    const row = fromTransfer(finding, day('2025-01-13'));
    expect(row.kind).toBe('impossible_transfer');
    expect(row.detail).toContain('RIDGE to BOWL');
    expect(row.severity).toBe('medium');
  });

  it('gives the same id however the evidence was ordered', () => {
    expect(exceptionKey('passback_same_lift', day('2025-01-13'), 'M', ['b', 'a'])).toBe(
      exceptionKey('passback_same_lift', day('2025-01-13'), 'M', ['a', 'b']),
    );
  });

  it('recognises the dispositions', () => {
    expect(isDisposition('referred')).toBe(true);
    expect(isDisposition('ignored')).toBe(false);
  });
});

describe('the register', () => {
  it('takes a set of findings for a day', () => {
    const register = new ExceptionRegister();
    const outcome = register.reconcile(day('2025-01-13'), passbackRows());
    expect(outcome).toEqual({ added: 1, kept: 0, dropped: 0 });
    expect(register.size).toBe(1);
    expect(register.open()).toHaveLength(1);
  });

  it('keeps the same rows when the day is recomputed unchanged', () => {
    const register = ExceptionRegister.from(passbackRows());
    const outcome = register.reconcile(day('2025-01-13'), passbackRows());
    expect(outcome).toEqual({ added: 0, kept: 1, dropped: 0 });
  });

  it('drops an open row a recompute no longer finds', () => {
    const register = ExceptionRegister.from(passbackRows());
    expect(register.reconcile(day('2025-01-13'), [])).toEqual({ added: 0, kept: 0, dropped: 1 });
    expect(register.size).toBe(0);
  });

  it('keeps a decided row even when the recompute stops finding it', () => {
    const register = ExceptionRegister.from(passbackRows());
    const id = register.all()[0]!.id;
    expectOk(register.decide(id, { disposition: 'dismissed', by: 'ops', at: DECIDED }), 'decide');
    expect(register.reconcile(day('2025-01-13'), [])).toEqual({ added: 0, kept: 0, dropped: 0 });
    expect(register.size).toBe(1);
  });

  it('leaves another day alone', () => {
    const register = ExceptionRegister.from(passbackRows());
    register.reconcile(day('2025-01-20'), []);
    expect(register.size).toBe(1);
  });

  it('records who decided and when', () => {
    const register = ExceptionRegister.from(passbackRows());
    const id = register.all()[0]!.id;
    const row = expectOk(
      register.decide(id, {
        disposition: 'confirmed',
        note: '  spoke to them  ',
        by: ' ops ',
        at: DECIDED,
      }),
      'decide',
    );
    expect(row).toMatchObject({
      disposition: 'confirmed',
      note: 'spoke to them',
      decidedBy: 'ops',
    });
    expect(row.decidedAt).toBe(DECIDED);
    expect(register.open()).toEqual([]);
  });

  it('refuses a decision on nothing, or with nobody behind it', () => {
    const register = ExceptionRegister.from(passbackRows());
    expect(
      isErr(register.decide('nope', { disposition: 'confirmed', by: 'ops', at: DECIDED })),
    ).toBe(true);
    const id = register.all()[0]!.id;
    expect(isErr(register.decide(id, { disposition: 'confirmed', by: '  ', at: DECIDED }))).toBe(
      true,
    );
  });

  it('slices by day and by subject and tallies', () => {
    const register = ExceptionRegister.from(passbackRows());
    const subject = register.all()[0]!.subject;
    expect(register.onDate(day('2025-01-13'))).toHaveLength(1);
    expect(register.onDate(day('2025-01-14'))).toEqual([]);
    expect(register.ofSubject(subject)).toHaveLength(1);
    expect([...register.byKind()]).toEqual([['passback_same_lift', 1]]);
    expect([...register.byDisposition()]).toEqual([['open', 1]]);
  });

  it('finds a subject that has been confirmed more than once', () => {
    const rides = ridesFrom([at(0, 'SUNB.01'), at(4, 'SUNB.01'), at(8, 'SUNB.01')]);
    const rows = findSameLiftPassbacks(rides, { lifts: lifts() }).map((finding) =>
      fromPassback(finding, day('2025-01-13')),
    );
    const register = ExceptionRegister.from(rows);
    for (const row of register.all()) {
      expectOk(
        register.decide(row.id, { disposition: 'confirmed', by: 'ops', at: DECIDED }),
        'decide',
      );
    }
    expect(register.repeatSubjects()).toHaveLength(1);
  });

  it('finds no repeats when nothing has been confirmed', () => {
    expect(ExceptionRegister.from(passbackRows()).repeatSubjects()).toEqual([]);
  });
});
