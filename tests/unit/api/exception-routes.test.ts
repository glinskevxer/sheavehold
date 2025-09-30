import { describe, expect, it } from 'vitest';
import { apiHarness } from '../../support/api.js';

const get = (path: string, query: Record<string, string> = {}) =>
  apiHarness().router.handle({ method: 'GET', path, query });

const period = { from: '2025-01-13', to: '2025-01-15' };

describe('reading the register', () => {
  it('pages the findings in the standard body shape', () => {
    const response = get('/exceptions', period);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object)).toEqual([
      'items',
      'returned',
      'total',
      'nextCursor',
    ]);
    expect((response.body as { total: number }).total).toBe(1);
  });

  it('gives the wire shape with nulls rather than missing fields', () => {
    const items = (get('/exceptions', period).body as { items: Record<string, unknown>[] }).items;
    expect(items[0]).toMatchObject({
      kind: 'passback_same_lift',
      date: '2025-01-13',
      disposition: 'open',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it('filters by state', () => {
    expect((get('/exceptions', { ...period, state: 'open' }).body as { total: number }).total).toBe(
      1,
    );
    expect(
      (get('/exceptions', { ...period, state: 'dismissed' }).body as { total: number }).total,
    ).toBe(0);
  });

  it('takes a limit and refuses a silly one', () => {
    expect(get('/exceptions', { ...period, limit: '1' }).status).toBe(200);
    expect(get('/exceptions', { ...period, limit: 'lots' }).status).toBe(400);
  });

  it('refuses a missing or reversed period', () => {
    expect(get('/exceptions').status).toBe(400);
    expect(get('/exceptions', { from: '2025-01-15', to: '2025-01-13' }).body).toMatchObject({
      code: 'reversed_period',
    });
  });

  it('gives one finding by id', () => {
    const items = (get('/exceptions', period).body as { items: { id: string }[] }).items;
    const response = get(`/exceptions/${encodeURIComponent(items[0]!.id)}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: items[0]!.id });
  });

  it('says so when the finding is not there', () => {
    const response = get('/exceptions/nope');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'no_exception' });
  });

  it('counts what is waiting', () => {
    expect(get('/exceptions/open/count').body).toMatchObject({
      open: 1,
      high: 0,
      oldest: '2025-01-13',
    });
  });
});

describe('deciding about a finding', () => {
  function harnessWithId() {
    const built = apiHarness();
    const listed = built.router.handle({ method: 'GET', path: '/exceptions', query: period });
    const items = (listed.body as { items: { id: string }[] }).items;
    return { router: built.router, id: items[0]!.id };
  }

  it('records the decision and what it was before', () => {
    const { router, id } = harnessWithId();
    const response = router.handle({
      method: 'POST',
      path: '/exceptions/decide',
      scopes: ['supervise'],
      body: { exceptionId: id, disposition: 'dismissed', by: 'ops', note: 'family' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ from: 'open', to: 'dismissed', by: 'ops' });
  });

  it('refuses a body that is the wrong shape', () => {
    const { router } = harnessWithId();
    const response = router.handle({
      method: 'POST',
      path: '/exceptions/decide',
      scopes: ['supervise'],
      body: { exceptionId: 'X', disposition: 'maybe', by: 'ops' },
    });
    expect(response.status).toBe(422);
  });

  it('says so when the finding is not there', () => {
    const { router } = harnessWithId();
    const response = router.handle({
      method: 'POST',
      path: '/exceptions/decide',
      scopes: ['supervise'],
      body: { exceptionId: 'nope', disposition: 'confirmed', by: 'ops' },
    });
    expect(response.status).toBe(404);
  });

  it('needs the supervise scope', () => {
    const { router, id } = harnessWithId();
    const response = router.handle({
      method: 'POST',
      path: '/exceptions/decide',
      scopes: [],
      body: { exceptionId: id, disposition: 'confirmed', by: 'ops' },
    });
    expect(response.status).toBe(403);
  });
});

describe('rescanning a day', () => {
  const post = (path: string, scopes: string[] = ['write']) =>
    apiHarness().router.handle({ method: 'POST', path, scopes });

  it('runs the rules again and says what changed', () => {
    const response = post('/exceptions/scan/2025-01-13');
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ date: '2025-01-13', found: 1, added: 0, kept: 1 });
  });

  it('refuses a bad date and needs the write scope', () => {
    expect(post('/exceptions/scan/never').status).toBe(400);
    expect(post('/exceptions/scan/2025-01-13', []).status).toBe(403);
  });
});
