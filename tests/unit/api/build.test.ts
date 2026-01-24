import { describe, expect, it } from 'vitest';
import { buildRouter } from '../../../src/api/build.js';
import { describeRoutes, renderApiReference, scopesUsed } from '../../../src/api/reference.js';
import { emptyApp } from '../../../src/cli/entry.js';
import { cliHarness } from '../../support/cli.js';

const empty = () => buildRouter({ app: emptyApp(), asOf: '2025-01-13' });
const loaded = () => buildRouter({ app: cliHarness([]).app, asOf: '2025-01-13' });

describe('assembling the router', () => {
  it('registers every group of routes', () => {
    const paths = describeRoutes(empty()).map((route) => route.path);
    expect(paths).toContain('/scans/day/:date');
    expect(paths).toContain('/rides/day/:date');
    expect(paths).toContain('/exceptions');
    expect(paths).toContain('/reports/daily/:date');
    expect(paths).toContain('/routes');
  });

  it('registers the same routes whether the store is empty or full', () => {
    expect(describeRoutes(empty()).map((route) => route.path)).toEqual(
      describeRoutes(loaded()).map((route) => route.path),
    );
  });

  it('uses the three scopes and no more', () => {
    expect(scopesUsed(empty())).toEqual(['ingest', 'supervise', 'write']);
  });

  it('answers a read against an empty store rather than falling over', () => {
    const response = empty().handle({ method: 'GET', path: '/rides/day/2025-01-13' });
    expect(response.status).toBe(200);
    expect((response.body as { rides: unknown[] }).rides).toEqual([]);
  });

  it('answers a read against a loaded store', () => {
    const response = loaded().handle({ method: 'GET', path: '/rides/day/2025-01-13' });
    expect((response.body as { rides: unknown[] }).rides).toHaveLength(4);
  });

  it('takes the season opening off the calendar when nobody said', () => {
    const response = empty().handle({
      method: 'GET',
      path: '/reports/season',
      query: { to: '2025-01-15' },
    });
    expect(response.body).toMatchObject({ from: '2024-11-22' });
  });

  it('takes an explicit season opening', () => {
    const router = buildRouter({
      app: emptyApp(),
      asOf: '2025-01-13',
      seasonOpensOn: '2024-12-01',
    });
    const response = router.handle({
      method: 'GET',
      path: '/reports/season',
      query: { to: '2025-01-15' },
    });
    expect(response.body).toMatchObject({ from: '2024-12-01' });
  });
});

describe('the reference off the assembled router', () => {
  it('names every route the build serves', () => {
    const text = renderApiReference(empty());
    for (const route of describeRoutes(empty())) {
      expect(text).toContain(`\`${route.path}\``);
    }
  });

  it('is the same for an empty store and a full one', () => {
    expect(renderApiReference(empty())).toBe(renderApiReference(loaded()));
  });
});
