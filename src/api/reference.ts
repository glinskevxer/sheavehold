import { renderTable, type Column } from '../util/table.js';
import type { Route, Router } from './router.js';
import { allProblemCodes, statusFor } from './problems.js';

/**
 * The router knows what routes exist, so nothing else should have to be told.
 * A hand written list went stale twice in one season and sent the front end
 * team looking for an endpoint that had been renamed in March.
 *
 * This is both the routes response and the source of the checked in api
 * reference, so the two can never disagree.
 */

export interface RouteDescription {
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly scope: string | null;
  readonly parameters: readonly string[];
}

export function describeRoute(route: Route): RouteDescription {
  const parameters = route.path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
  return {
    method: route.method,
    path: route.path,
    summary: route.summary,
    scope: route.scope ?? null,
    parameters,
  };
}

export function describeRoutes(router: Router): RouteDescription[] {
  return router.all().map(describeRoute);
}

/** Routes anybody can call, which is what the read only front end needs. */
export function openRoutes(router: Router): RouteDescription[] {
  return describeRoutes(router).filter((route) => route.scope === null);
}

export function scopesUsed(router: Router): string[] {
  const scopes = new Set<string>();
  for (const route of router.all()) {
    if (route.scope !== undefined) scopes.add(route.scope);
  }
  return [...scopes].sort();
}

const columns: Column<RouteDescription>[] = [
  { header: 'method', value: (row) => row.method },
  { header: 'path', maxWidth: 34, value: (row) => row.path },
  { header: 'scope', value: (row) => row.scope ?? '' },
  { header: 'summary', maxWidth: 34, value: (row) => row.summary },
];

export function renderRouteTable(router: Router): string[] {
  return renderTable(describeRoutes(router), columns);
}

/** The checked in reference, generated so it cannot drift. */
export function renderApiReference(router: Router): string {
  const lines: string[] = ['# api reference', ''];
  lines.push('Generated from the router. Do not edit by hand.', '');
  lines.push('| method | path | scope | summary |');
  lines.push('| --- | --- | --- | --- |');
  for (const route of describeRoutes(router)) {
    const scope = route.scope ?? '';
    lines.push(`| ${route.method} | \`${route.path}\` | ${scope} | ${route.summary} |`);
  }
  lines.push('', '## scopes', '');
  const scopes = scopesUsed(router);
  if (scopes.length === 0) lines.push('No route needs a scope.');
  else for (const scope of scopes) lines.push(`- \`${scope}\``);
  lines.push('', '## problem codes', '');
  lines.push('| code | status |');
  lines.push('| --- | --- |');
  for (const code of allProblemCodes()) {
    lines.push(`| \`${code}\` | ${statusFor(code)} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function addReferenceRoute(router: Router): Router {
  router.add({
    method: 'GET',
    path: '/routes',
    summary: 'every route this build serves',
    handler: () => ({ status: 200, body: { routes: describeRoutes(router) } }),
  });
  return router;
}
