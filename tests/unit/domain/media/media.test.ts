import { describe, expect, it } from 'vitest';
import { isMediaForm, isMediaStatus, makeMedia } from '../../../../src/domain/media/media.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';

const base = {
  serial: 'E2004A1B00000123',
  printedId: '4021-8830-1174',
  form: 'hard_card',
  issuedAt: new Date('2024-11-20T17:00:00Z'),
  status: 'active',
};

describe('media', () => {
  it('reads a card off the issuing desk', () => {
    const media = expectOk(makeMedia(base), 'media');
    expect(media.serial).toBe('E2004A1B00000123');
    expect(media.printedId).toBe('4021-8830-1174');
    expect(media.reusable).toBe(true);
  });

  it('folds a lower case serial', () => {
    expect(expectOk(makeMedia({ ...base, serial: 'e2004a1b00000123' }), 'media').serial).toBe(
      'E2004A1B00000123',
    );
  });

  it('defaults reusable off for everything but a hard card', () => {
    expect(expectOk(makeMedia({ ...base, form: 'wallet' }), 'media').reusable).toBe(false);
    expect(expectOk(makeMedia({ ...base, form: 'wristband' }), 'media').reusable).toBe(false);
  });

  it('lets the desk override reusable', () => {
    expect(
      expectOk(makeMedia({ ...base, form: 'wristband', reusable: true }), 'media').reusable,
    ).toBe(true);
  });

  it('refuses a reusable phone', () => {
    expect(isErr(makeMedia({ ...base, form: 'phone', reusable: true }))).toBe(true);
    expect(expectOk(makeMedia({ ...base, form: 'phone' }), 'media').reusable).toBe(false);
  });

  it('recognises the forms and statuses', () => {
    expect(isMediaForm('wallet')).toBe(true);
    expect(isMediaForm('paper')).toBe(false);
    expect(isMediaStatus('destroyed')).toBe(true);
    expect(isMediaStatus('melted')).toBe(false);
  });

  it('refuses a bad serial, printed id, form, status or date', () => {
    expect(isErr(makeMedia({ ...base, serial: 'nope' }))).toBe(true);
    expect(isErr(makeMedia({ ...base, printedId: '402188301174' }))).toBe(true);
    expect(isErr(makeMedia({ ...base, form: 'paper' }))).toBe(true);
    expect(isErr(makeMedia({ ...base, status: 'melted' }))).toBe(true);
    expect(isErr(makeMedia({ ...base, issuedAt: new Date('not a date') }))).toBe(true);
  });
});
