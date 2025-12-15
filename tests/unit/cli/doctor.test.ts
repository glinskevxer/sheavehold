import { describe, expect, it } from 'vitest';
import { addDoctorCommand } from '../../../src/cli/commands/doctor.js';
import { EXIT_FAILED, EXIT_OK } from '../../../src/cli/output.js';
import { entitlement } from '../../support/entitlements.js';
import { cliHarness } from '../../support/cli.js';

const harness = () => cliHarness([addDoctorCommand]);

describe('a healthy store', () => {
  it('passes and says so', () => {
    const cli = harness();
    expect(cli.run(['doctor'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('checks run');
    expect(cli.output.text).toContain('the store is consistent');
  });

  it('prints nothing when quiet', () => {
    const cli = harness();
    expect(cli.run(['doctor', '--quiet'])).toBe(EXIT_OK);
    expect(cli.output.out).toEqual([]);
  });
});

describe('a store with a problem', () => {
  it('fails the run and names the problem', () => {
    const cli = harness();
    cli.app.reference.entitlements.upsert(entitlement('ENT-X', 'GONE', 'G-000'));
    expect(cli.run(['doctor'])).toBe(EXIT_FAILED);
    expect(cli.output.errorText).toContain('integrity.dangling_reference');
  });

  it('still prints the problem when quiet', () => {
    const cli = harness();
    cli.app.reference.entitlements.upsert(entitlement('ENT-X', 'GONE', 'G-000'));
    cli.run(['doctor', '--quiet']);
    expect(cli.output.out).toEqual([]);
    expect(cli.output.errorText).not.toBe('');
  });
});

describe('warnings', () => {
  it('prints a warning without failing the run', () => {
    const cli = harness();
    cli.app.reference.entitlements.delete('ENT-1001');
    expect(cli.run(['doctor'])).toBe(EXIT_OK);
    expect(cli.output.text).toContain('integrity.ride_entitlement');
  });

  it('fails on a warning when asked to', () => {
    const cli = harness();
    cli.app.reference.entitlements.delete('ENT-1001');
    expect(cli.run(['doctor', '--warnings'])).toBe(EXIT_FAILED);
  });

  it('reports a gate clock that needs a work order', () => {
    const cli = harness();
    expect(cli.run(['doctor'])).toBe(EXIT_OK);
    expect(cli.output.text).not.toContain('needs a work order');
  });
});
