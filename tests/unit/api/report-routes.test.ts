import { describe, expect, it } from 'vitest';
import { parseFormat } from '../../../src/api/report-routes.js';
import { apiHarness } from '../../support/api.js';

const get = (path: string, query: Record<string, string> = {}) =>
  apiHarness().router.handle({ method: 'GET', path, query });

describe('the format query', () => {
  it('defaults to json and takes the three we serve', () => {
    expect(parseFormat(undefined)).toBe('json');
    expect(parseFormat('')).toBe('json');
    expect(parseFormat('text')).toBe('text');
    expect(parseFormat('csv')).toBe('csv');
  });

  it('refuses anything else', () => {
    expect(parseFormat('pdf')).toBeUndefined();
  });
});

describe('the daily report route', () => {
  it('gives json by default', () => {
    const response = get('/reports/daily/2025-01-13');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ date: '2025-01-13', version: 2 });
  });

  it('gives text when asked, with a content type', () => {
    const response = get('/reports/daily/2025-01-13', { format: 'text' });
    expect(response.headers).toEqual({ 'content-type': 'text/plain' });
    expect(String(response.body).startsWith(' ')).toBe(true);
  });

  it('gives csv when asked', () => {
    const response = get('/reports/daily/2025-01-13', { format: 'csv' });
    expect(response.headers).toEqual({ 'content-type': 'text/csv' });
    expect(String(response.body).split('\n')[0]?.startsWith('date,status')).toBe(true);
  });

  it('refuses a bad date and a bad format', () => {
    expect(get('/reports/daily/never').status).toBe(400);
    expect(get('/reports/daily/2025-01-13', { format: 'pdf' }).status).toBe(400);
  });
});

describe('the season route', () => {
  it('runs from the season opening when nobody said otherwise', () => {
    const response = get('/reports/season', { to: '2025-01-15' });
    expect(response.body).toMatchObject({ from: '2024-11-22', to: '2025-01-15' });
  });

  it('takes an explicit period', () => {
    const response = get('/reports/season', { from: '2025-01-13', to: '2025-01-15' });
    expect(response.body).toMatchObject({ from: '2025-01-13', skierVisits: 2 });
  });

  it('gives null rather than leaving the best day off', () => {
    const response = get('/reports/season', { from: '2025-02-01', to: '2025-02-03' });
    expect(response.body).toMatchObject({ bestDate: null });
  });

  it('gives text when asked', () => {
    const response = get('/reports/season', { to: '2025-01-15', format: 'text' });
    expect(String(response.body).startsWith('season to date')).toBe(true);
  });

  it('refuses a missing or bad period', () => {
    expect(get('/reports/season').status).toBe(400);
    expect(get('/reports/season', { to: 'never' }).status).toBe(400);
    expect(get('/reports/season', { from: 'never', to: '2025-01-15' }).status).toBe(400);
    expect(get('/reports/season', { to: '2025-01-15', format: 'pdf' }).status).toBe(400);
  });
});

describe('the utilisation and product routes', () => {
  it('give json with the rows in it', () => {
    const utilisation = get('/reports/utilisation', { from: '2025-01-13', to: '2025-01-15' });
    expect(utilisation.body).toMatchObject({ from: '2025-01-13' });
    expect((utilisation.body as { lifts: unknown[] }).lifts.length).toBeGreaterThan(0);

    const products = get('/reports/products', { from: '2025-01-13', to: '2025-01-15' });
    expect(products.body).toMatchObject({ totalVisits: 2 });
  });

  it('give text when asked', () => {
    const utilisation = get('/reports/utilisation', {
      from: '2025-01-13',
      to: '2025-01-15',
      format: 'text',
    });
    expect(String(utilisation.body).startsWith('lift utilisation')).toBe(true);
    const products = get('/reports/products', {
      from: '2025-01-13',
      to: '2025-01-15',
      format: 'text',
    });
    expect(String(products.body).startsWith('product mix')).toBe(true);
  });

  it('refuse a missing period', () => {
    expect(get('/reports/utilisation').status).toBe(400);
    expect(get('/reports/utilisation', { from: '2025-01-13' }).status).toBe(400);
    expect(get('/reports/products').status).toBe(400);
    expect(get('/reports/products', { from: '2025-01-13' }).status).toBe(400);
  });
});
