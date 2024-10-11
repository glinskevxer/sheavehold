import { describe, expect, it } from 'vitest';
import {
  BindingLedger,
  bindingCovers,
  bindingsOverlap,
  makeBinding,
  type Binding,
} from '../../../../src/domain/media/binding.js';
import { parseMediaSerial, type MediaSerial } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';

const serial = (raw: string): MediaSerial => expectOk(parseMediaSerial(raw), 'serial');
const CARD = serial('E2004A1B00000123');
const OTHER = serial('E2004A1B00000456');

function bind(overrides: Partial<Parameters<typeof makeBinding>[0]> = {}): Binding {
  return expectOk(
    makeBinding({
      serial: CARD,
      entitlementId: 'ENT-1001',
      guestId: 'G-77',
      from: new Date('2024-12-20T16:00:00Z'),
      ...overrides,
    }),
    'binding',
  );
}

describe('a binding', () => {
  it('defaults the reason and leaves the end open', () => {
    const binding = bind();
    expect(binding.reason).toBe('issued');
    expect(binding.until).toBeUndefined();
  });

  it('refuses an empty entitlement or guest', () => {
    expect(isErr(makeBinding({ ...bind(), entitlementId: ' ' }))).toBe(true);
    expect(isErr(makeBinding({ ...bind(), guestId: ' ' }))).toBe(true);
  });

  it('refuses an end at or before the start', () => {
    const from = new Date('2024-12-20T16:00:00Z');
    expect(isErr(makeBinding({ ...bind(), from, until: from }))).toBe(true);
    expect(isErr(makeBinding({ ...bind(), from, until: new Date('2024-12-19T16:00:00Z') }))).toBe(
      true,
    );
    expect(isErr(makeBinding({ ...bind(), from, until: new Date('nope') }))).toBe(true);
  });

  it('covers a half open interval', () => {
    const binding = bind({ until: new Date('2024-12-21T16:00:00Z') });
    expect(bindingCovers(binding, new Date('2024-12-20T16:00:00Z'))).toBe(true);
    expect(bindingCovers(binding, new Date('2024-12-21T15:59:59Z'))).toBe(true);
    expect(bindingCovers(binding, new Date('2024-12-21T16:00:00Z'))).toBe(false);
    expect(bindingCovers(binding, new Date('2024-12-20T15:59:59Z'))).toBe(false);
  });

  it('runs forever with no end', () => {
    expect(bindingCovers(bind(), new Date('2030-01-01T00:00:00Z'))).toBe(true);
  });

  it('spots two intervals that touch but do not overlap', () => {
    const first = bind({ until: new Date('2024-12-21T16:00:00Z') });
    const second = bind({ from: new Date('2024-12-21T16:00:00Z') });
    expect(bindingsOverlap(first, second)).toBe(false);
    expect(bindingsOverlap(first, bind({ from: new Date('2024-12-21T15:00:00Z') }))).toBe(true);
  });
});

describe('the ledger', () => {
  it('resolves a serial as of a moment, not as of now', () => {
    const ledger = BindingLedger.from([
      bind({ until: new Date('2024-12-21T16:00:00Z') }),
      bind({
        entitlementId: 'ENT-2002',
        guestId: 'G-91',
        from: new Date('2024-12-21T16:00:00Z'),
        reason: 'rental reissue',
      }),
    ]);
    expect(ledger.resolve(CARD, new Date('2024-12-20T18:00:00Z'))?.guestId).toBe('G-77');
    expect(ledger.resolve(CARD, new Date('2024-12-22T18:00:00Z'))?.guestId).toBe('G-91');
    expect(ledger.resolve(CARD, new Date('2024-12-01T18:00:00Z'))).toBeUndefined();
    expect(ledger.resolve(OTHER, new Date('2024-12-22T18:00:00Z'))).toBeUndefined();
  });

  it('refuses two bindings that overlap', () => {
    const ledger = BindingLedger.from([bind()]);
    expect(() => ledger.add(bind({ entitlementId: 'ENT-2002' }))).toThrow('bound twice');
  });

  it('keeps the history in issue order', () => {
    const ledger = BindingLedger.from([
      bind({ from: new Date('2025-01-05T16:00:00Z'), entitlementId: 'ENT-3' }),
      bind({
        from: new Date('2024-12-20T16:00:00Z'),
        until: new Date('2025-01-05T16:00:00Z'),
        entitlementId: 'ENT-1',
      }),
    ]);
    expect(ledger.history(CARD).map((b) => b.entitlementId)).toEqual(['ENT-1', 'ENT-3']);
    expect(ledger.history(OTHER)).toEqual([]);
    expect(ledger.size).toBe(1);
  });

  it('closes an open binding when the card comes back', () => {
    const ledger = BindingLedger.from([bind()]);
    const closed = expectOk(ledger.release(CARD, new Date('2024-12-21T16:00:00Z')), 'release');
    expect(closed.until?.toISOString()).toBe('2024-12-21T16:00:00.000Z');
    expect(closed.reason).toBe('returned');
    expect(ledger.resolve(CARD, new Date('2024-12-22T00:00:00Z'))).toBeUndefined();
  });

  it('refuses to release what is not out and refuses a release in the past', () => {
    expect(isErr(new BindingLedger().release(CARD, new Date('2024-12-21T16:00:00Z')))).toBe(true);
    const ledger = BindingLedger.from([bind()]);
    expect(isErr(ledger.release(CARD, new Date('2024-12-19T16:00:00Z')))).toBe(true);
  });

  it('lets the card go out again once it is released', () => {
    const ledger = BindingLedger.from([bind()]);
    expectOk(ledger.release(CARD, new Date('2024-12-21T16:00:00Z')), 'release');
    ledger.add(bind({ entitlementId: 'ENT-9', from: new Date('2024-12-21T16:00:00Z') }));
    expect(ledger.resolve(CARD, new Date('2024-12-22T00:00:00Z'))?.entitlementId).toBe('ENT-9');
  });

  it('follows an entitlement across a replacement card', () => {
    const ledger = BindingLedger.from([
      bind({ until: new Date('2025-01-05T16:00:00Z'), reason: 'lost' }),
      bind({ serial: OTHER, from: new Date('2025-01-05T16:00:00Z'), reason: 'replacement' }),
    ]);
    expect(ledger.serialsFor('ENT-1001')).toEqual([CARD, OTHER]);
    expect(ledger.serialsFor('ENT-NOPE')).toEqual([]);
    expect(ledger.serials()).toEqual([CARD, OTHER]);
  });
});
