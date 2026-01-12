import { describe, expect, it } from 'vitest';
import { ok, problem, Router, type RouteContext } from '../../../src/api/router.js';

function router(): Router {
  return new Router()
    .add({ method: 'GET', path: '/days', handler: () => ok({ days: [] }), summary: 'list days' })
    .add({
      method: 'GET',
      path: '/days/:date',
      handler: (context: RouteContext) => ok({ date: context.params['date'] }),
      summary: 'one day',
    })
    .add({
      method: 'POST',
      path: '/days/:date/recompute',
      handler: (context) => ok({ rebuilt: context.params['date'] }, 202),
      summary: 'rebuild a day',
      scope: 'write',
    });
}

describe('matching a route', () => {
  it('finds a plain path', () => {
    expect(router().handle({ method: 'GET', path: '/days' })).toEqual({
      status: 200,
      body: { days: [] },
    });
  });

  it('pulls the parameters out', () => {
    const response = router().handle({ method: 'GET', path: '/days/2025-01-13' });
    expect(response.body).toEqual({ date: '2025-01-13' });
  });

  it('decodes a parameter', () => {
    const response = router().handle({ method: 'GET', path: '/days/2025%2D01%2D13' });
    expect(response.body).toEqual({ date: '2025-01-13' });
  });

  it('does not let a longer path fall into a shorter route', () => {
    expect(router().handle({ method: 'GET', path: '/days/2025-01-13/rides' }).status).toBe(404);
  });

  it('ignores leading and trailing slashes', () => {
    expect(router().handle({ method: 'GET', path: '/days/' }).status).toBe(200);
    expect(router().handle({ method: 'GET', path: 'days' }).status).toBe(200);
  });

  it('says the method is wrong rather than that the path is missing', () => {
    const response = router().handle({ method: 'DELETE', path: '/days' });
    expect(response.status).toBe(405);
    expect(response.body).toMatchObject({ code: 'method_not_allowed' });
  });

  it('says nothing is there for a path nobody registered', () => {
    const response = router().handle({ method: 'GET', path: '/lifts' });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'not_found' });
  });
});

describe('registering routes', () => {
  it('counts and lists what it holds', () => {
    const built = router();
    expect(built.size).toBe(3);
    expect(built.all().map((route) => route.path)).toEqual([
      '/days',
      '/days/:date',
      '/days/:date/recompute',
    ]);
  });

  it('refuses two routes that would both match', () => {
    const built = router();
    expect(() =>
      built.add({ method: 'GET', path: '/days/:other', handler: () => ok({}), summary: 'clash' }),
    ).toThrow('clashes with');
  });

  it('allows the same path under a different method', () => {
    expect(() =>
      router().add({ method: 'PUT', path: '/days/:date', handler: () => ok({}), summary: 'set' }),
    ).not.toThrow();
  });
});

describe('scopes', () => {
  it('refuses a route the caller has no scope for', () => {
    const response = router().handle({ method: 'POST', path: '/days/2025-01-13/recompute' });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'forbidden' });
  });

  it('lets a caller with the scope through', () => {
    const response = router().handle({
      method: 'POST',
      path: '/days/2025-01-13/recompute',
      scopes: ['write'],
    });
    expect(response.status).toBe(202);
  });

  it('leaves a route with no scope open', () => {
    expect(router().handle({ method: 'GET', path: '/days', scopes: [] }).status).toBe(200);
  });
});

describe('when a handler falls over', () => {
  it('turns it into a five hundred rather than throwing at the caller', () => {
    const built = new Router().add({
      method: 'GET',
      path: '/boom',
      summary: 'break',
      handler: () => {
        throw new Error('the store is not open');
      },
    });
    const response = built.handle({ method: 'GET', path: '/boom' });
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: 'handler_failed' });
  });
});

describe('the response helpers', () => {
  it('default to two hundred and carry a status when given one', () => {
    expect(ok({ a: 1 })).toEqual({ status: 200, body: { a: 1 } });
    expect(ok({ a: 1 }, 201).status).toBe(201);
    expect(problem(422, 'bad_date', 'nope')).toEqual({
      status: 422,
      body: { code: 'bad_date', detail: 'nope' },
    });
  });
});
