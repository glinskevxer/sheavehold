import { describe, expect, it } from 'vitest';
import {
  buildProductMix,
  renderProductMix,
  underEarning,
} from '../../../src/report/product-mix.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = () => buildProductMix(day('2025-01-13'), day('2025-01-15'), reportContext());

describe('building the mix', () => {
  it('gives one row per product that carried a visit', () => {
    expect(
      report()
        .rows.map((row) => row.productCode)
        .sort(),
    ).toEqual(['A3DAY', 'SEAS']);
  });

  it('names the product and its kind', () => {
    const seas = report().rows.find((row) => row.productCode === 'SEAS');
    expect(seas?.productName).toBe('Season Pass');
    expect(seas?.kind).toBe('season');
  });

  it('counts visits, rides and vertical', () => {
    const seas = report().rows.find((row) => row.productCode === 'SEAS');
    expect(seas).toMatchObject({ visits: 1, rides: 3, verticalFt: 3720 });
  });

  it('gives both shares side by side', () => {
    const rows = report().rows;
    expect(rows.every((row) => row.visitShare > 0)).toBe(true);
    expect(rows.every((row) => row.valueShare > 0)).toBe(true);
    const total = rows.reduce((sum, row) => sum + row.visitShare, 0);
    expect(Math.round(total)).toBe(100);
  });

  it('gives a per visit figure', () => {
    const seas = report().rows.find((row) => row.productCode === 'SEAS');
    expect(seas?.perVisit).toBe(seas?.value);
  });

  it('totals the visits and the money', () => {
    const built = report();
    expect(built.totalVisits).toBe(2);
    expect(built.totalValue).toBe(89_900 + 34_500);
  });

  it('leaves a product nobody used off entirely', () => {
    expect(report().rows.some((row) => row.productCode === 'BEG')).toBe(false);
  });

  it('gives nothing for a period with no visits', () => {
    const empty = buildProductMix(day('2025-02-01'), day('2025-02-03'), reportContext());
    expect(empty.rows).toEqual([]);
    expect(empty.totalVisits).toBe(0);
  });
});

describe('rendering the mix', () => {
  it('opens with the period', () => {
    expect(renderProductMix(report())[0]).toBe('product mix  2025-01-13 to 2025-01-15');
  });

  it('prints both share columns', () => {
    const lines = renderProductMix(report());
    expect(lines[2]?.trim().split(/\s+/)).toEqual([
      'product',
      'name',
      'kind',
      'visits',
      'visit_pc',
      'value',
      'value_pc',
      'per_visit',
    ]);
  });

  it('closes with the totals', () => {
    const lines = renderProductMix(report());
    expect(lines[lines.length - 1]).toBe('2 visits worth $1,244.00');
  });
});

describe('finding what does not pay its way', () => {
  it('names a product that is more of the visits than of the money', () => {
    const found = underEarning(report());
    expect(found.every((row) => row.visitShare > row.valueShare)).toBe(true);
  });

  it('finds nothing when there is nothing to compare', () => {
    const empty = buildProductMix(day('2025-02-01'), day('2025-02-03'), reportContext());
    expect(underEarning(empty)).toEqual([]);
  });
});
