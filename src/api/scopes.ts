import type { ApiRequest, ApiResponse, Router } from './router.js';
import { fail } from './problems.js';

/**
 * Who is allowed to do what. There is no user database behind this: the base
 * station is on the area network and the callers are four pieces of software,
 * so a role is a shared key in the configuration file and that is the right
 * amount of security for a box in a lift shack.
 *
 * What matters is that the mapping is written down once. The gate uploader
 * holding a key that can also dismiss fraud findings is the failure this
 * prevents, and it was the state of the world for one season.
 */

export const SCOPES = ['ingest', 'write', 'supervise', 'export'] as const;

export type Scope = (typeof SCOPES)[number];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

export interface Role {
  readonly name: string;
  readonly scopes: readonly Scope[];
  readonly note: string;
}

export const ROLES: readonly Role[] = [
  { name: 'gate', scopes: ['ingest'], note: 'the uploader on each base station' },
  { name: 'ops', scopes: ['write'], note: 'the operations front end' },
  { name: 'supervisor', scopes: ['write', 'supervise'], note: 'the maze supervisors' },
  { name: 'finance', scopes: ['export'], note: 'the nightly extract' },
  { name: 'reader', scopes: [], note: 'anything that only reads' },
];

export function roleNamed(name: string): Role | undefined {
  return ROLES.find((role) => role.name === name.trim().toLowerCase());
}

export function scopesOfRole(name: string): readonly Scope[] {
  return roleNamed(name)?.scopes ?? [];
}

/** Keys come out of the configuration file, never out of the source. */
export type KeyBook = ReadonlyMap<string, string>;

export function resolveScopes(
  keys: KeyBook,
  key: string | undefined,
): readonly Scope[] | undefined {
  if (key === undefined || key.trim() === '') return [];
  const role = keys.get(key.trim());
  if (role === undefined) return undefined;
  return scopesOfRole(role);
}

export interface AuthenticatedRouter {
  handle(request: ApiRequest & { readonly key?: string | undefined }): ApiResponse;
}

/**
 * Wraps a router so callers present a key rather than a scope list. An
 * unrecognised key is refused outright, and no key at all is a reader.
 */
export function withKeys(router: Router, keys: KeyBook): AuthenticatedRouter {
  return {
    handle(request) {
      const scopes = resolveScopes(keys, request.key);
      if (scopes === undefined) return fail('forbidden', 'that key is not recognised');
      return router.handle({ ...request, scopes });
    },
  };
}

/** Every scope a caller would need to reach every route the router serves. */
export function scopesNeeded(router: Router): Scope[] {
  const needed = new Set<Scope>();
  for (const route of router.all()) {
    if (route.scope !== undefined && isScope(route.scope)) needed.add(route.scope);
  }
  return [...needed].sort();
}

/** Roles that cannot reach a scope, which is what the config check prints. */
export function rolesMissingScope(scope: Scope): string[] {
  return ROLES.filter((role) => !role.scopes.includes(scope))
    .map((role) => role.name)
    .sort();
}
