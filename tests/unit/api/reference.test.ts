import { describe, expect, it } from 'vitest';
import {
  addReferenceRoute,
  describeRoute,
  describeRoutes,
  openRoutes,
  renderApiReference,
  renderRouteTable,
  scopesUsed,
} from '../../../src/api/reference.js';
import { Router } from '../../../src/api/router.js';
import { apiHarness } from '../../support/api.js';

const router = () => apiHarness().router;

describe('describing one route', () => {
  it('pulls the parameters out of the path', () => {
    expect(
      describeRoute({
        method: 'GET',
        path: '/rides/lift/:lift/:date',
        summary: 'rides on a lift',
        handler: () => ({ status: 200, body: {} }),
      }),
    ).toEqual({
      method: 'GET',
      path: '/rides/lift/:lift/:date',
      summary: 'rides on a lift',
      scope: null,
      parameters: ['lift', 'date'],
    });
  });

  it('keeps the scope when there is one', () => {
    expect(
      describeRoute({
        method: 'POST',
        path: '/x',
        summary: 'x',
        scope: 'write',
        handler: () => ({ status: 200, body: {} }),
      }).scope,
    ).toBe('write');
  });
});

describe('describing the whole router', () => {
  it('lists every route in path order', () => {
    const routes = describeRoutes(router());
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.map((route) => route.path)).toEqual([...routes.map((r) => r.path)].sort());
  });

  it('separates the open routes from the ones needing a scope', () => {
    const open = openRoutes(router());
    expect(open.every((route) => route.scope === null)).toBe(true);
    expect(open.length).toBeLessThan(describeRoutes(router()).length);
  });

  it('lists the scopes in use', () => {
    expect(scopesUsed(router())).toEqual(['ingest', 'write']);
    expect(scopesUsed(new Router())).toEqual([]);
  });

  it('prints a table', () => {
    const lines = renderRouteTable(router());
    expect(lines[0]?.trim().split(/\s+/)).toEqual(['method', 'path', 'scope', 'summary']);
    expect(lines.length).toBe(describeRoutes(router()).length + 2);
  });
});

describe('the generated reference', () => {
  it('opens with a heading and a warning not to edit it', () => {
    const text = renderApiReference(router());
    expect(text.startsWith('# api reference')).toBe(true);
    expect(text).toContain('Do not edit by hand');
  });

  it('has a row for every route', () => {
    const built = router();
    const text = renderApiReference(built);
    for (const route of describeRoutes(built)) {
      expect(text).toContain(`\`${route.path}\``);
    }
  });

  it('lists the scopes and the problem codes', () => {
    const text = renderApiReference(router());
    expect(text).toContain('## scopes');
    expect(text).toContain('`write`');
    expect(text).toContain('## problem codes');
    expect(text).toContain('| `bad_date` | 400 |');
  });

  it('says so when no route needs a scope', () => {
    expect(renderApiReference(new Router())).toContain('No route needs a scope.');
  });

  it('ends with a newline so the file is well formed', () => {
    expect(renderApiReference(new Router()).endsWith('\n')).toBe(true);
  });
});

describe('the routes endpoint', () => {
  it('answers with what the build serves', () => {
    const built = addReferenceRoute(router());
    const response = built.handle({ method: 'GET', path: '/routes' });
    expect(response.status).toBe(200);
    const routes = (response.body as { routes: unknown[] }).routes;
    expect(routes.length).toBe(describeRoutes(built).length);
  });
});
