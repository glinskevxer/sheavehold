import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  isLastPage,
  MAX_PAGE_SIZE,
  pageBody,
  paginate,
  readPageRequest,
} from '../../../src/api/pagination.js';
import { expect as expectOk } from '../../../src/util/result.js';

const rows = Array.from({ length: 10 }, (_, i) => ({ id: `R-${String(i).padStart(2, '0')}` }));
const keyOf = (row: { id: string }) => row.id;

describe('reading a page request', () => {
  it('defaults the limit and takes no cursor', () => {
    expect(expectOk(readPageRequest({}), 'page')).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      after: undefined,
    });
  });

  it('takes a limit and a cursor', () => {
    expect(expectOk(readPageRequest({ limit: '5', after: 'R-04' }), 'page')).toEqual({
      limit: 5,
      after: 'R-04',
    });
  });

  it('treats an empty string as absent', () => {
    expect(expectOk(readPageRequest({ limit: '', after: '' }), 'page').after).toBeUndefined();
  });

  it('refuses a limit that is not a whole number above zero', () => {
    expect(readPageRequest({ limit: 'lots' }).ok).toBe(false);
    expect(readPageRequest({ limit: '0' }).ok).toBe(false);
    expect(readPageRequest({ limit: '2.5' }).ok).toBe(false);
  });

  it('caps the limit', () => {
    const result = readPageRequest({ limit: String(MAX_PAGE_SIZE + 1) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.body).toMatchObject({ code: 'limit_too_large' });
    expect(expectOk(readPageRequest({ limit: String(MAX_PAGE_SIZE) }), 'page').limit).toBe(
      MAX_PAGE_SIZE,
    );
  });
});

describe('cutting a page', () => {
  it('gives the first page and a cursor', () => {
    const page = paginate(rows, { limit: 4, after: undefined }, keyOf);
    expect(page.items.map(keyOf)).toEqual(['R-00', 'R-01', 'R-02', 'R-03']);
    expect(page.nextCursor).toBe('R-03');
    expect(page.total).toBe(10);
    expect(page.returned).toBe(4);
    expect(isLastPage(page)).toBe(false);
  });

  it('carries on from a cursor', () => {
    const page = paginate(rows, { limit: 4, after: 'R-03' }, keyOf);
    expect(page.items.map(keyOf)).toEqual(['R-04', 'R-05', 'R-06', 'R-07']);
  });

  it('marks the last page with no cursor', () => {
    const page = paginate(rows, { limit: 4, after: 'R-05' }, keyOf);
    expect(page.items.map(keyOf)).toEqual(['R-06', 'R-07', 'R-08', 'R-09']);
    expect(page.nextCursor).toBeUndefined();
    expect(isLastPage(page)).toBe(true);
  });

  it('gives nothing for a cursor past the end', () => {
    const page = paginate(rows, { limit: 4, after: 'R-09' }, keyOf);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(10);
  });

  it('gives nothing for a cursor nobody recognises', () => {
    expect(paginate(rows, { limit: 4, after: 'R-99' }, keyOf).items).toEqual([]);
  });

  it('gives everything when the limit is wider than the list', () => {
    const page = paginate(rows, { limit: 100, after: undefined }, keyOf);
    expect(page.returned).toBe(10);
    expect(page.nextCursor).toBeUndefined();
  });

  it('handles an empty list', () => {
    const page = paginate([], { limit: 4, after: undefined }, keyOf);
    expect(page).toEqual({ items: [], nextCursor: undefined, total: 0, returned: 0 });
  });
});

describe('the page body', () => {
  it('gives the same shape whatever the route', () => {
    const page = paginate(rows, { limit: 2, after: undefined }, keyOf);
    expect(pageBody(page, (row) => row.id)).toEqual({
      items: ['R-00', 'R-01'],
      returned: 2,
      total: 10,
      nextCursor: 'R-01',
    });
  });

  it('gives null rather than leaving the cursor off on the last page', () => {
    const page = paginate(rows, { limit: 100, after: undefined }, keyOf);
    expect(pageBody(page, (row) => row.id).nextCursor).toBeNull();
  });
});
