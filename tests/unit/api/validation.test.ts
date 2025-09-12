import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  dispositionBody,
  firstProblem,
  overrideBody,
  readBody,
  readDate,
  readPeriod,
  recomputeBody,
} from '../../../src/api/validation.js';
import { expect as expectOk } from '../../../src/util/result.js';

const detailOf = (result: { ok: false; error: { body: unknown } }): string =>
  (result.error.body as { detail: string }).detail;

describe('reading a body', () => {
  const schema = z.object({ name: z.string().min(1), count: z.number().int() });

  it('gives the parsed value back', () => {
    expect(expectOk(readBody(schema, { name: 'a', count: 2 }), 'body')).toEqual({
      name: 'a',
      count: 2,
    });
  });

  it('names the field that was wrong', () => {
    const result = readBody(schema, { name: '', count: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(422);
    expect(result.error.body).toMatchObject({ code: 'invalid_body' });
    expect(detailOf(result)).toContain('name:');
  });

  it('names the body itself when it is the wrong shape entirely', () => {
    const result = readBody(schema, 'not an object');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(detailOf(result).startsWith('body:')).toBe(true);
  });

  it('reports the first problem when there are several', () => {
    const parsed = schema.safeParse({ count: 'two' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstProblem(parsed.error).field).toBe('name');
  });
});

describe('reading a date', () => {
  it('takes a real date', () => {
    expect(expectOk(readDate('2025-01-13'), 'date')).toBe('2025-01-13');
  });

  it('says which parameter is missing', () => {
    const result = readDate(undefined, 'from');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(detailOf(result)).toBe('from is required');
  });

  it('names the parameter that was malformed', () => {
    const result = readDate('never', 'to');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(detailOf(result).startsWith('to:')).toBe(true);
  });
});

describe('reading a period', () => {
  it('takes two dates in order', () => {
    expect(expectOk(readPeriod('2025-01-13', '2025-01-15'), 'period')).toEqual({
      from: '2025-01-13',
      to: '2025-01-15',
    });
  });

  it('allows a single day period', () => {
    expect(expectOk(readPeriod('2025-01-13', '2025-01-13'), 'period').to).toBe('2025-01-13');
  });

  it('refuses a reversed period with its own code', () => {
    const result = readPeriod('2025-01-15', '2025-01-13');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.body).toMatchObject({ code: 'reversed_period' });
  });

  it('passes a missing or bad end straight back', () => {
    expect(readPeriod('2025-01-13', undefined).ok).toBe(false);
    expect(readPeriod(undefined, '2025-01-13').ok).toBe(false);
    expect(readPeriod('2025-01-13', 'never').ok).toBe(false);
  });
});

describe('the write bodies', () => {
  it('takes a disposition and who decided it', () => {
    expect(
      expectOk(readBody(dispositionBody, { disposition: 'dismissed', by: 'ops' }), 'body'),
    ).toEqual({ disposition: 'dismissed', by: 'ops' });
  });

  it('refuses a disposition nobody has heard of and an empty name', () => {
    expect(readBody(dispositionBody, { disposition: 'maybe', by: 'ops' }).ok).toBe(false);
    expect(readBody(dispositionBody, { disposition: 'open', by: '' }).ok).toBe(false);
  });

  it('takes a recompute reason and an optional gap', () => {
    expect(
      expectOk(readBody(recomputeBody, { reason: 'late upload', sessionGapMinutes: 200 }), 'body'),
    ).toMatchObject({ sessionGapMinutes: 200 });
    expect(readBody(recomputeBody, { reason: 'x', sessionGapMinutes: 5 }).ok).toBe(false);
    expect(readBody(recomputeBody, {}).ok).toBe(false);
  });

  it('takes an override with a note under the cap', () => {
    expect(
      readBody(overrideBody, {
        exceptionId: 'X-1',
        disposition: 'confirmed',
        by: 'ops',
        note: 'spoke to them',
      }).ok,
    ).toBe(true);
    expect(
      readBody(overrideBody, {
        exceptionId: 'X-1',
        disposition: 'confirmed',
        by: 'ops',
        note: 'x'.repeat(501),
      }).ok,
    ).toBe(false);
  });
});
