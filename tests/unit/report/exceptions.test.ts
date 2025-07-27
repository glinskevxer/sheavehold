import { describe, expect, it } from 'vitest';
import {
  buildExceptionReport,
  exceptionHeadline,
  openOfKind,
  renderExceptionReport,
  STALE_AFTER_DAYS,
} from '../../../src/report/exceptions.js';
import { ExceptionRegister } from '../../../src/domain/exception/register.js';
import { applyOverride } from '../../../src/service/exceptions.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const DECIDED = new Date('2025-01-14T17:00:00Z');
const registerOf = () => reportContext().register;
const empty = () =>
  buildExceptionReport(
    day('2025-02-01'),
    day('2025-02-03'),
    new ExceptionRegister(),
    day('2025-02-03'),
  );

const report = (register = registerOf(), asOf = '2025-01-14') =>
  buildExceptionReport(day('2025-01-13'), day('2025-01-15'), register, day(asOf));

describe('building the register report', () => {
  it('keeps only the rows inside the period', () => {
    expect(report().rows).toHaveLength(1);
    expect(
      buildExceptionReport(day('2025-02-01'), day('2025-02-03'), registerOf(), day('2025-02-03'))
        .rows,
    ).toEqual([]);
  });

  it('tallies by kind and by state', () => {
    const built = report();
    expect([...built.byKind]).toEqual([['passback_same_lift', 1]]);
    expect([...built.byDisposition]).toEqual([['open', 1]]);
  });

  it('counts what is open', () => {
    expect(report().openCount).toBe(1);
  });

  it('counts nothing stale when the finding is from yesterday', () => {
    expect(report().staleCount).toBe(0);
    expect(STALE_AFTER_DAYS).toBe(7);
  });

  it('counts a finding as stale once a week has gone by', () => {
    const built = buildExceptionReport(
      day('2025-01-13'),
      day('2025-01-31'),
      registerOf(),
      day('2025-01-31'),
    );
    expect(built.staleCount).toBe(1);
  });

  it('drops a decided row out of the open count', () => {
    const register = registerOf();
    const id = register.all()[0]!.id;
    expectOk(
      applyOverride(register, {
        exceptionId: id,
        disposition: 'dismissed',
        by: 'ops',
        at: DECIDED,
      }),
      'override',
    );
    const built = report(register);
    expect(built.openCount).toBe(0);
    expect([...built.byDisposition]).toEqual([['dismissed', 1]]);
  });

  it('names subjects confirmed more than once', () => {
    expect(report().repeatSubjects).toEqual([]);
  });
});

describe('rendering the register', () => {
  it('opens with the period and the open count', () => {
    const lines = renderExceptionReport(report());
    expect(lines[0]).toBe('exception register  2025-01-13 to 2025-01-15');
    expect(lines[1]).toContain('1 open');
  });

  it('prints a table when there is something in it', () => {
    const lines = renderExceptionReport(report());
    expect(lines[3]?.trim().split(/\s+/)).toEqual([
      'date',
      'kind',
      'sev',
      'subject',
      'detail',
      'state',
      'by',
    ]);
  });

  it('says so when the register is empty', () => {
    expect(renderExceptionReport(empty())).toContain('  nothing to look at');
  });
});

describe('the headline', () => {
  it('counts the open findings and the serious ones', () => {
    expect(exceptionHeadline(report())).toBe('1 open exceptions, 0 serious');
  });

  it('says nothing is open when nothing is', () => {
    expect(exceptionHeadline(empty())).toBe('no open exceptions');
  });

  it('filters the open rows by kind', () => {
    expect(openOfKind(report(), 'passback_same_lift')).toHaveLength(1);
    expect(openOfKind(report(), 'impossible_transfer')).toEqual([]);
  });
});
