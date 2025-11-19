import { describe, expect, it } from 'vitest';
import {
  addRevenueCommand,
  WEIGHTINGS,
  weightingNamed,
} from '../../../src/cli/commands/revenue.js';
import { EXIT_FAILED, EXIT_OK } from '../../../src/cli/output.js';
import { cliHarness } from '../../support/cli.js';

const harness = () => cliHarness([addRevenueCommand]);

describe('the weighting flag', () => {
  it('names the four the area reports on', () => {
    expect(WEIGHTINGS).toEqual(['even', 'rides', 'vertical', 'rate-card']);
  });

  it('gives no rule for an even split, which is the default', () => {
    expect(weightingNamed(harness().app, 'even')).toBeUndefined();
  });

  it('gives a rule for the others', () => {
    const app = harness().app;
    expect(typeof weightingNamed(app, 'rides')).toBe('function');
    expect(typeof weightingNamed(app, 'vertical')).toBe('function');
    expect(typeof weightingNamed(app, 'rate-card')).toBe('function');
  });

  it('gives nothing for one nobody has heard of', () => {
    expect(weightingNamed(harness().app, 'guesswork')).toBeUndefined();
  });
});

describe('revenue days', () => {
  it('prints a row per day with the split named', () => {
    const cli = harness();
    expect(cli.run(['revenue', 'days', '2025-01-13', '2025-01-15'])).toBe(EXIT_OK);
    expect(cli.output.out[0]).toBe('revenue 2025-01-13 to 2025-01-15, split even');
    expect(cli.output.text).toContain('2025-01-13');
    expect(cli.output.text).toContain('$');
  });

  it('takes a different weighting', () => {
    const cli = harness();
    expect(cli.run(['revenue', 'days', '2025-01-13', '2025-01-15', '--weighting', 'rides'])).toBe(
      EXIT_OK,
    );
    expect(cli.output.out[0]).toContain('split rides');
  });

  it('refuses a weighting nobody has heard of', () => {
    const cli = harness();
    expect(
      cli.run(['revenue', 'days', '2025-01-13', '2025-01-15', '--weighting', 'guesswork']),
    ).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('not a weighting');
  });

  it('refuses a bad period', () => {
    const cli = harness();
    expect(cli.run(['revenue', 'days', 'never', '2025-01-15'])).toBe(EXIT_FAILED);
    expect(cli.run(['revenue', 'days', '2025-01-13', 'never'])).toBe(EXIT_FAILED);
  });
});

describe('revenue products', () => {
  it('prints a row per product that carried a visit', () => {
    const cli = harness();
    expect(cli.run(['revenue', 'products'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('SEAS');
    expect(cli.output.text).toContain('Season Pass');
  });
});

describe('revenue passes', () => {
  it('prints what each unlimited pass cost', () => {
    const cli = harness();
    expect(cli.run(['revenue', 'passes'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('ENT-1001');
    expect(cli.output.text).toContain('beat_window');
  });

  it('says so when none were sold', () => {
    const cli = harness();
    for (const entitlement of cli.app.reference.entitlements.all()) {
      cli.app.reference.entitlements.delete(entitlement.id);
    }
    cli.run(['revenue', 'passes']);
    expect(cli.output.text).toBe('no unlimited passes were sold');
  });
});
