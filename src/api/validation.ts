import { z } from 'zod';
import { parseOperatingDate, type OperatingDate } from '../util/clock.js';
import { err, ok, type Result } from '../util/result.js';
import { problem, type ApiResponse } from './router.js';

/**
 * Every route used to open with the same six lines of hand rolled checking and
 * they had drifted into four different error shapes. A caller could not tell a
 * missing field from a malformed one without reading the prose.
 *
 * So bodies go through a schema and the failure is turned into one problem
 * shape, with the path of the field that was wrong in it.
 */

export interface FieldProblem {
  readonly field: string;
  readonly message: string;
}

export function firstProblem(error: z.ZodError): FieldProblem {
  const issue = error.issues[0];
  if (issue === undefined) return { field: 'body', message: 'is not valid' };
  const field = issue.path.length === 0 ? 'body' : issue.path.join('.');
  return { field, message: issue.message };
}

export function readBody<T>(schema: z.ZodType<T>, body: unknown): Result<T, ApiResponse> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return ok(parsed.data);
  const found = firstProblem(parsed.error);
  return err(problem(422, 'invalid_body', `${found.field}: ${found.message}`));
}

export function readDate(
  raw: string | undefined,
  field = 'date',
): Result<OperatingDate, ApiResponse> {
  if (raw === undefined || raw === '') {
    return err(problem(400, 'missing_parameter', `${field} is required`));
  }
  const parsed = parseOperatingDate(raw);
  if (!parsed.ok) return err(problem(400, 'bad_date', `${field}: ${parsed.error}`));
  return ok(parsed.value);
}

export function readPeriod(
  from: string | undefined,
  to: string | undefined,
): Result<{ from: OperatingDate; to: OperatingDate }, ApiResponse> {
  const start = readDate(from, 'from');
  if (!start.ok) return start;
  const end = readDate(to, 'to');
  if (!end.ok) return end;
  if (end.value < start.value) {
    return err(problem(400, 'reversed_period', 'to is before from'));
  }
  return ok({ from: start.value, to: end.value });
}

/** Bodies the write routes take. */
export const dispositionBody = z.object({
  disposition: z.enum(['open', 'confirmed', 'dismissed', 'referred']),
  by: z.string().min(1),
  note: z.string().optional(),
});

export const recomputeBody = z.object({
  reason: z.string().min(1).max(200),
  sessionGapMinutes: z.number().int().min(30).max(720).optional(),
});

export const overrideBody = z.object({
  exceptionId: z.string().min(1),
  disposition: z.enum(['open', 'confirmed', 'dismissed', 'referred']),
  by: z.string().min(1),
  note: z.string().max(500).optional(),
});

export type DispositionBody = z.infer<typeof dispositionBody>;
export type RecomputeBody = z.infer<typeof recomputeBody>;
export type OverrideBody = z.infer<typeof overrideBody>;
