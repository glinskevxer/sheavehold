import { describe, expect, it } from 'vitest';
import {
  buildExtract,
  extractManifest,
  identifyingFields,
  pseudonymFor,
  renderExtract,
  trimPostcode,
} from '../../../src/service/extract.js';
import { parseCsvTable } from '../../../src/util/csv.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { cliHarness } from '../../support/cli.js';
import { day } from '../../support/season.js';

const period = { from: day('2025-01-13'), to: day('2025-01-15'), salt: 'season-2024' };
const stores = () => cliHarness([]).app;

describe('the pseudonym', () => {
  it('is stable for the same guest and salt', () => {
    expect(pseudonymFor('G-77', 'a')).toBe(pseudonymFor('G-77', 'a'));
  });

  it('changes with the salt and with the guest', () => {
    expect(pseudonymFor('G-77', 'a')).not.toBe(pseudonymFor('G-77', 'b'));
    expect(pseudonymFor('G-77', 'a')).not.toBe(pseudonymFor('G-78', 'a'));
  });

  it('is a fixed shape that carries no guest id', () => {
    expect(pseudonymFor('G-77', 'a')).toMatch(/^P-[0-9a-f]{8}$/);
    expect(pseudonymFor('G-77', 'a')).not.toContain('G-77');
  });
});

describe('trimming a postcode', () => {
  it('keeps a town rather than a street', () => {
    expect(trimPostcode('81657', 3)).toBe('816');
    expect(trimPostcode('81657', 0)).toBe('');
  });

  it('leaves an empty postcode empty', () => {
    expect(trimPostcode('', 3)).toBe('');
  });
});

describe('building the extract', () => {
  it('only carries guests who opted in and skied', () => {
    const rows = buildExtract(stores(), period);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pseudonym).toBe(pseudonymFor('G-77', period.salt));
  });

  it('carries the numbers the agency asked for', () => {
    const row = buildExtract(stores(), period)[0];
    expect(row).toMatchObject({
      ageBand: 'adult',
      postcodePrefix: '816',
      daysSkied: 1,
      rides: 2,
      liftsUsed: 1,
    });
    expect(row?.firstDate).toBe('2025-01-13');
  });

  it('takes a wider postcode when asked', () => {
    expect(buildExtract(stores(), { ...period, postcodeDigits: 5 })[0]?.postcodePrefix).toBe(
      '81657',
    );
  });

  it('refuses to run without a salt', () => {
    expect(() => buildExtract(stores(), { ...period, salt: '  ' })).toThrow('needs a salt');
  });

  it('gives nothing for a period nobody skied', () => {
    expect(
      buildExtract(stores(), { ...period, from: day('2025-02-01'), to: day('2025-02-03') }),
    ).toEqual([]);
  });

  it('never carries anything that names a guest', () => {
    for (const row of buildExtract(stores(), period)) {
      expect(identifyingFields(row)).toEqual([]);
    }
  });
});

describe('rendering the extract', () => {
  it('reads back as a table with the agreed header', () => {
    const table = expectOk(parseCsvTable(renderExtract(buildExtract(stores(), period))), 'csv');
    expect(table.header).toEqual([
      'pseudonym',
      'age_band',
      'postcode_prefix',
      'days_skied',
      'rides',
      'vertical_ft',
      'lifts_used',
      'first_date',
      'last_date',
    ]);
    expect(table.records).toHaveLength(1);
  });

  it('writes just the header when nobody qualifies', () => {
    expect(renderExtract([]).split('\n')).toHaveLength(1);
  });
});

describe('the manifest', () => {
  it('records the period, the salt and what was left out', () => {
    const rows = buildExtract(stores(), period);
    const manifest = extractManifest(stores(), period, rows);
    expect(manifest).toMatchObject({ from: '2025-01-13', to: '2025-01-15', rows: 1 });
    expect(manifest.optedOut).toBeGreaterThan(0);
    expect(manifest.salt).toBe('season-2024');
  });

  it('checksums the file so a rerun can be compared', () => {
    const rows = buildExtract(stores(), period);
    expect(extractManifest(stores(), period, rows).checksum).toBe(
      extractManifest(stores(), period, rows).checksum,
    );
    expect(extractManifest(stores(), period, []).checksum).not.toBe(
      extractManifest(stores(), period, rows).checksum,
    );
  });
});
