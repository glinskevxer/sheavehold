import { problem, type ApiResponse } from './router.js';

/**
 * Every route was choosing its own status code next to its own message, and
 * two of them had already disagreed: a bad date was a 400 on one route and a
 * 422 on another, for the same input. A caller cannot write one error handler
 * against that.
 *
 * So the code decides the status, once, here. Adding a code is a deliberate
 * act and the table is the documentation.
 */

export type ProblemCode =
  | 'bad_date'
  | 'bad_format'
  | 'bad_lift'
  | 'bad_limit'
  | 'bad_media'
  | 'bad_terminal'
  | 'empty_upload'
  | 'forbidden'
  | 'handler_failed'
  | 'invalid_body'
  | 'limit_too_large'
  | 'method_not_allowed'
  | 'missing_parameter'
  | 'no_batch'
  | 'no_exception'
  | 'no_guest'
  | 'not_found'
  | 'reversed_period'
  | 'unreadable_upload';

const STATUS: Readonly<Record<ProblemCode, number>> = {
  bad_date: 400,
  bad_format: 400,
  bad_lift: 400,
  bad_limit: 400,
  bad_media: 400,
  bad_terminal: 400,
  empty_upload: 400,
  forbidden: 403,
  handler_failed: 500,
  invalid_body: 422,
  limit_too_large: 400,
  method_not_allowed: 405,
  missing_parameter: 400,
  no_batch: 404,
  no_exception: 404,
  no_guest: 404,
  not_found: 404,
  reversed_period: 400,
  unreadable_upload: 422,
};

export function statusFor(code: ProblemCode): number {
  return STATUS[code];
}

export function fail(code: ProblemCode, detail: string): ApiResponse {
  return problem(statusFor(code), code, detail);
}

export function allProblemCodes(): ProblemCode[] {
  return (Object.keys(STATUS) as ProblemCode[]).sort();
}

/** Codes that mean the caller asked for something that is not there. */
export function isNotFound(code: ProblemCode): boolean {
  return statusFor(code) === 404;
}

/** Codes that mean the caller sent something wrong, rather than us. */
export function isCallerFault(code: ProblemCode): boolean {
  const status = statusFor(code);
  return status >= 400 && status < 500;
}
