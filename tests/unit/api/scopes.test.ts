import { describe, expect, it } from 'vitest';
import {
  isScope,
  ROLES,
  resolveScopes,
  roleNamed,
  rolesMissingScope,
  SCOPES,
  scopesNeeded,
  scopesOfRole,
  withKeys,
} from '../../../src/api/scopes.js';
import { apiHarness } from '../../support/api.js';

const keys = new Map([
  ['k-gate', 'gate'],
  ['k-ops', 'ops'],
  ['k-sup', 'supervisor'],
  ['k-bad', 'nobody'],
]);

describe('the scope list', () => {
  it('recognises the four scopes and nothing else', () => {
    expect(SCOPES).toHaveLength(4);
    expect(isScope('supervise')).toBe(true);
    expect(isScope('root')).toBe(false);
  });

  it('gives every role a name, a note and a scope list', () => {
    for (const role of ROLES) {
      expect(role.name).not.toBe('');
      expect(role.note).not.toBe('');
      expect(role.scopes.every(isScope)).toBe(true);
    }
  });

  it('keeps the uploader away from the supervisor decisions', () => {
    expect(scopesOfRole('gate')).toEqual(['ingest']);
    expect(scopesOfRole('gate')).not.toContain('supervise');
  });

  it('finds a role however it was typed', () => {
    expect(roleNamed(' OPS ')?.name).toBe('ops');
    expect(roleNamed('nobody')).toBeUndefined();
    expect(scopesOfRole('nobody')).toEqual([]);
  });
});

describe('resolving a key', () => {
  it('gives the scopes of the role behind it', () => {
    expect(resolveScopes(keys, 'k-sup')).toEqual(['write', 'supervise']);
  });

  it('treats no key as a reader', () => {
    expect(resolveScopes(keys, undefined)).toEqual([]);
    expect(resolveScopes(keys, '  ')).toEqual([]);
  });

  it('refuses a key it does not know', () => {
    expect(resolveScopes(keys, 'k-nope')).toBeUndefined();
  });

  it('gives nothing for a key pointing at a role that has gone', () => {
    expect(resolveScopes(keys, 'k-bad')).toEqual([]);
  });
});

describe('the wrapped router', () => {
  const wrapped = () => withKeys(apiHarness().router, keys);

  it('lets a reader read', () => {
    expect(wrapped().handle({ method: 'GET', path: '/rides/day/2025-01-13' }).status).toBe(200);
  });

  it('lets the ops key rebuild a day', () => {
    const response = wrapped().handle({
      method: 'POST',
      path: '/rides/day/2025-01-13/recompute',
      key: 'k-ops',
    });
    expect(response.status).toBe(202);
  });

  it('keeps the gate key out of the rebuild', () => {
    const response = wrapped().handle({
      method: 'POST',
      path: '/rides/day/2025-01-13/recompute',
      key: 'k-gate',
    });
    expect(response.status).toBe(403);
  });

  it('keeps the ops key out of a supervisor decision', () => {
    const response = wrapped().handle({
      method: 'POST',
      path: '/exceptions/decide',
      key: 'k-ops',
      body: { exceptionId: 'X', disposition: 'confirmed', by: 'ops' },
    });
    expect(response.status).toBe(403);
  });

  it('refuses a key nobody issued', () => {
    const response = wrapped().handle({
      method: 'GET',
      path: '/rides/day/2025-01-13',
      key: 'k-nope',
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'forbidden' });
  });
});

describe('checking the configuration', () => {
  it('lists the scopes the routes actually need', () => {
    expect(scopesNeeded(apiHarness().router)).toEqual(['ingest', 'supervise', 'write']);
  });

  it('names the roles that cannot reach a scope', () => {
    expect(rolesMissingScope('supervise')).toEqual(['finance', 'gate', 'ops', 'reader']);
  });
});
