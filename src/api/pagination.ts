import { err, ok, type Result } from '../util/result.js';
import { fail } from './problems.js';
import type { ApiResponse } from './router.js';

/**
 * A busy Saturday is forty thousand rides and the front end asked for a whole
 * season in one call, twice, in production. So the list routes page.
 *
 * The cursor is an opaque string rather than an offset. It carries the key of
 * the last row returned, so a page is stable across a recompute that inserts
 * rows earlier in the list, which an offset is not.
 */

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 2_000;

export interface PageRequest {
  readonly limit: number;
  readonly after: string | undefined;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | undefined;
  readonly total: number;
  readonly returned: number;
}

export function readPageRequest(
  query: Readonly<Record<string, string>>,
): Result<PageRequest, ApiResponse> {
  const rawLimit = query.limit;
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== undefined && rawLimit !== '') {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return err(fail('bad_limit', `limit ${rawLimit} is not a whole number above zero`));
    }
    if (parsed > MAX_PAGE_SIZE) {
      return err(fail('limit_too_large', `limit is capped at ${MAX_PAGE_SIZE}`));
    }
    limit = parsed;
  }
  const after = query.after === undefined || query.after === '' ? undefined : query.after;
  return ok({ limit, after });
}

/**
 * Cut a page out of an ordered list. The list must be sorted by the same key
 * the cursor is taken from, which every caller here is.
 */
export function paginate<T>(
  rows: readonly T[],
  request: PageRequest,
  keyOf: (row: T) => string,
): Page<T> {
  let start = 0;
  if (request.after !== undefined) {
    const at = rows.findIndex((row) => keyOf(row) === request.after);
    start = at === -1 ? rows.length : at + 1;
  }
  const items = rows.slice(start, start + request.limit);
  const last = items[items.length - 1];
  const more = start + items.length < rows.length;
  return {
    items,
    nextCursor: more && last !== undefined ? keyOf(last) : undefined,
    total: rows.length,
    returned: items.length,
  };
}

/** The body shape every paged route returns, so a caller learns it once. */
export function pageBody<T, U>(page: Page<T>, map: (row: T) => U): Record<string, unknown> {
  return {
    items: page.items.map(map),
    returned: page.returned,
    total: page.total,
    nextCursor: page.nextCursor ?? null,
  };
}

export function isLastPage<T>(page: Page<T>): boolean {
  return page.nextCursor === undefined;
}
