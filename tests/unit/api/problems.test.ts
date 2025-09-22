import { describe, expect, it } from 'vitest';
import {
  allProblemCodes,
  fail,
  isCallerFault,
  isNotFound,
  statusFor,
} from '../../../src/api/problems.js';
import { apiHarness } from '../../support/api.js';

describe('the problem table', () => {
  it('gives every code exactly one status', () => {
    for (const code of allProblemCodes()) {
      expect(Number.isInteger(statusFor(code))).toBe(true);
      expect(statusFor(code)).toBeGreaterThanOrEqual(400);
    }
  });

  it('lists the codes in order and covers the ones the routes use', () => {
    const codes = allProblemCodes();
    expect(codes).toEqual([...codes].sort());
    expect(codes).toContain('bad_date');
    expect(codes).toContain('no_guest');
    expect(codes).toContain('unreadable_upload');
  });

  it('builds a response from the code alone', () => {
    expect(fail('bad_date', 'nope')).toEqual({
      status: 400,
      body: { code: 'bad_date', detail: 'nope' },
    });
    expect(fail('no_guest', 'gone').status).toBe(404);
    expect(fail('invalid_body', 'field').status).toBe(422);
  });

  it('separates the not found codes from the rest', () => {
    expect(isNotFound('no_batch')).toBe(true);
    expect(isNotFound('bad_date')).toBe(false);
  });

  it('separates what the caller got wrong from what we did', () => {
    expect(isCallerFault('bad_date')).toBe(true);
    expect(isCallerFault('handler_failed')).toBe(false);
  });
});

describe('the routes use the table', () => {
  const get = (path: string, query: Record<string, string> = {}) =>
    apiHarness().router.handle({ method: 'GET', path, query });

  it('gives the same status for a bad date on every route', () => {
    const statuses = [
      get('/scans/day/never').status,
      get('/rides/day/never').status,
      get('/visits/day/never').status,
      get('/reports/daily/never').status,
    ];
    expect(new Set(statuses).size).toBe(1);
    expect(statuses[0]).toBe(statusFor('bad_date'));
  });

  it('gives the right status for each kind of missing thing', () => {
    expect(get('/batches/up-999').status).toBe(statusFor('no_batch'));
    expect(get('/guests/G-000').status).toBe(statusFor('no_guest'));
  });

  it('still carries the code in the body', () => {
    expect(get('/rides/lift/S/2025-01-13').body).toMatchObject({ code: 'bad_lift' });
  });
});
