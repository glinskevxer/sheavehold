/**
 * A router with no http server behind it. The base station runs one process and
 * the web front end talks to it over a unix socket that the operations team's
 * own tooling owns, so bringing an http framework in would buy nothing and
 * would make every test start a listener.
 *
 * A route is a method and a path with `:name` segments. Matching is exact on
 * segment count, so `/days/2025-01-13` never falls into `/days`.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiRequest {
  readonly method: Method;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>> | undefined;
  readonly body?: unknown;
  readonly scopes?: readonly string[] | undefined;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface RouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly request: ApiRequest;
}

export type Handler = (context: RouteContext) => ApiResponse;

export interface Route {
  readonly method: Method;
  readonly path: string;
  readonly handler: Handler;
  readonly summary: string;
  readonly scope?: string | undefined;
}

interface CompiledRoute extends Route {
  readonly segments: readonly string[];
}

function split(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

export function ok(body: unknown, status = 200): ApiResponse {
  return { status, body };
}

export function problem(status: number, code: string, detail: string): ApiResponse {
  return { status, body: { code, detail } };
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(route: Route): this {
    const segments = split(route.path);
    const clash = this.routes.find(
      (existing) =>
        existing.method === route.method &&
        existing.segments.length === segments.length &&
        existing.segments.every(
          (segment, index) =>
            segment === segments[index] ||
            segment.startsWith(':') ||
            (segments[index] ?? '').startsWith(':'),
        ),
    );
    if (clash !== undefined) {
      throw new Error(`route ${route.method} ${route.path} clashes with ${clash.path}`);
    }
    this.routes.push({ ...route, segments });
    return this;
  }

  get size(): number {
    return this.routes.length;
  }

  all(): readonly Route[] {
    return [...this.routes].sort(
      (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    );
  }

  private match(
    request: ApiRequest,
  ): { route: CompiledRoute; params: Record<string, string> } | undefined {
    const wanted = split(request.path);
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      if (route.segments.length !== wanted.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const segment = route.segments[i] ?? '';
        const value = wanted[i] ?? '';
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(value);
          continue;
        }
        if (segment !== value) {
          matched = false;
          break;
        }
      }
      if (matched) return { route, params };
    }
    return undefined;
  }

  handle(request: ApiRequest): ApiResponse {
    const found = this.match(request);
    if (found === undefined) {
      const otherMethod = this.routes.some((route) => {
        const wanted = split(request.path);
        return (
          route.segments.length === wanted.length &&
          route.segments.every((segment, i) => segment.startsWith(':') || segment === wanted[i])
        );
      });
      if (otherMethod) {
        return problem(405, 'method_not_allowed', `${request.method} is not allowed here`);
      }
      return problem(404, 'not_found', `nothing is routed at ${request.path}`);
    }

    const { route, params } = found;
    if (route.scope !== undefined && !(request.scopes ?? []).includes(route.scope)) {
      return problem(403, 'forbidden', `this route needs the ${route.scope} scope`);
    }

    try {
      return route.handler({ params, query: request.query ?? {}, body: request.body, request });
    } catch (cause) {
      return problem(500, 'handler_failed', String(cause));
    }
  }
}
