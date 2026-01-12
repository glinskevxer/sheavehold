import { describe, expect, it } from 'vitest';
import { apiHarness } from '../../support/api.js';

const get = (path: string) => apiHarness().router.handle({ method: 'GET', path });

describe('reading rides', () => {
  it('gives a day of rides in the wire shape', () => {
    const response = get('/rides/day/2025-01-13');
    expect(response.status).toBe(200);
    const rides = (response.body as { rides: Record<string, unknown>[] }).rides;
    expect(rides).toHaveLength(4);
    expect(Object.keys(rides[0] ?? {})).toEqual([
      'id',
      'date',
      'lift',
      'terminal',
      'guest',
      'entitlement',
      'product',
      'boardedAt',
      'unloadsAt',
      'verticalFt',
    ]);
  });

  it('gives an empty day rather than a not found', () => {
    expect((get('/rides/day/2025-01-20').body as { rides: unknown[] }).rides).toEqual([]);
  });

  it('refuses a date that is not a date', () => {
    expect(get('/rides/day/never').status).toBe(400);
  });

  it('slices one lift on one day', () => {
    const response = get('/rides/lift/SUNB/2025-01-13');
    expect((response.body as { rides: unknown[] }).rides).toHaveLength(2);
  });

  it('refuses a bad lift or a bad date on the lift route', () => {
    expect(get('/rides/lift/S/2025-01-13').status).toBe(400);
    expect(get('/rides/lift/SUNB/never').status).toBe(400);
  });
});

describe('reading visits', () => {
  it('gives the visits and the skier visit count', () => {
    const response = get('/visits/day/2025-01-13');
    expect(response.body).toMatchObject({ date: '2025-01-13', skierVisits: 2 });
    expect((response.body as { visits: unknown[] }).visits).toHaveLength(2);
  });

  it('gives the session count rather than the sessions', () => {
    const visits = (get('/visits/day/2025-01-13').body as { visits: Record<string, unknown>[] })
      .visits;
    expect(visits[0]?.['sessions']).toBe(1);
  });

  it('refuses a bad date', () => {
    expect(get('/visits/day/nope').status).toBe(400);
  });
});

describe('reading a guest', () => {
  it('answers what they are carrying and where they have been', () => {
    const response = get('/guests/G-77');
    expect(response.body).toMatchObject({
      guest: 'G-77',
      name: 'Ardley, Row',
      ageBand: 'adult',
      household: 'HH-1',
      daysSkied: 1,
      rides: 2,
      favouriteLift: 'SUNB',
    });
  });

  it('gives null rather than leaving a field off', () => {
    const response = get('/guests/G-93');
    expect(response.body).toMatchObject({ ageBand: null, household: null, favouriteLift: null });
  });

  it('shows an unlimited pass as having no day count', () => {
    const body = get('/guests/G-77').body as { entitlements: Record<string, unknown>[] };
    expect(body.entitlements[0]).toMatchObject({ product: 'SEAS', daysLeft: null, voided: false });
  });

  it('counts down a ticket', () => {
    const body = get('/guests/G-78').body as { entitlements: Record<string, unknown>[] };
    expect(body.entitlements[0]).toMatchObject({ product: 'A3DAY', daysLeft: 2 });
  });

  it('says so when nobody is on file', () => {
    const response = get('/guests/G-000');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'no_guest' });
  });
});

describe('rebuilding a day', () => {
  const post = (path: string, scopes: string[] = ['write']) =>
    apiHarness().router.handle({ method: 'POST', path, scopes });

  it('rebuilds and reports what it did', () => {
    const response = post('/rides/day/2025-01-13/recompute');
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ date: '2025-01-13', scans: 4, rides: 4, visits: 2 });
  });

  it('refuses a bad date', () => {
    expect(post('/rides/day/never/recompute').status).toBe(400);
  });

  it('needs the write scope', () => {
    expect(post('/rides/day/2025-01-13/recompute', []).status).toBe(403);
  });
});
