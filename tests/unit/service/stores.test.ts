import { describe, expect, it } from 'vitest';
import {
  exceptionScanContext,
  guestQueryContext,
  ingestContext,
  queryContext,
  recomputeContext,
  reportContext,
  revenueContext,
} from '../../../src/service/stores.js';
import { cliHarness } from '../../support/cli.js';
import { day } from '../../support/season.js';

const stores = () => cliHarness([]).app;

describe('the context builders', () => {
  it('give the query context the four things a read needs', () => {
    const context = queryContext(stores());
    expect(Object.keys(context).sort()).toEqual(['calendar', 'lifts', 'rides', 'scans']);
  });

  it('give the revenue context the two it needs', () => {
    expect(Object.keys(revenueContext(stores())).sort()).toEqual(['reference', 'rides']);
  });

  it('give the recompute context everything a rebuild reads', () => {
    expect(Object.keys(recomputeContext(stores())).sort()).toEqual([
      'blackouts',
      'calendar',
      'lifts',
      'products',
      'reference',
      'rides',
      'scans',
      'terminals',
    ]);
  });

  it('stamp the ingest context with the current time', () => {
    const app = stores();
    expect(ingestContext(app).receivedAt).toEqual(app.now());
  });

  it('give the exception scan the register it is meant to write to', () => {
    const app = stores();
    expect(exceptionScanContext(app).register).toBe(app.register);
  });

  it('carry the as of date onto the guest context', () => {
    expect(guestQueryContext(stores(), day('2025-01-15')).asOf).toBe('2025-01-15');
  });
});

describe('the report context', () => {
  it('is the query context plus the revenue one', () => {
    const app = stores();
    const context = reportContext(app);
    for (const key of Object.keys(queryContext(app))) expect(key in context).toBe(true);
    for (const key of Object.keys(revenueContext(app))) expect(key in context).toBe(true);
  });

  it('always carries the register, which is what used to go missing', () => {
    const app = stores();
    expect(reportContext(app).register).toBe(app.register);
    expect(reportContext(app).register.size).toBeGreaterThan(0);
  });

  it('stamps when it was built', () => {
    const app = stores();
    expect(reportContext(app).generatedAt).toEqual(app.now());
  });
});

describe('one bag of stores', () => {
  it('serves every context off the same objects', () => {
    const app = stores();
    expect(queryContext(app).rides).toBe(recomputeContext(app).rides);
    expect(revenueContext(app).reference).toBe(recomputeContext(app).reference);
    expect(ingestContext(app).scans).toBe(queryContext(app).scans);
  });
});
