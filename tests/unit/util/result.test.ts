import { describe, expect, it } from 'vitest';
import {
  all,
  andThen,
  err,
  expect as expectOk,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  partition,
  unwrapOr,
} from '../../../src/util/result.js';

describe('result', () => {
  it('carries the value through ok and the reason through err', () => {
    const good = ok(12);
    const bad = err('gate offline');
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    expect(good.ok && good.value).toBe(12);
    expect(!bad.ok && bad.error).toBe('gate offline');
  });

  it('maps only the ok side', () => {
    expect(map(ok(3), (n) => n * 2)).toEqual(ok(6));
    expect(map(err<string>('nope'), (n: number) => n * 2)).toEqual(err('nope'));
  });

  it('maps only the err side', () => {
    expect(mapErr(err('nope'), (e) => e.toUpperCase())).toEqual(err('NOPE'));
    expect(mapErr(ok(3), (e: string) => e.toUpperCase())).toEqual(ok(3));
  });

  it('chains with andThen and stops at the first failure', () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err(`${n} is odd`));
    expect(andThen(ok(8), half)).toEqual(ok(4));
    expect(andThen(ok(7), half)).toEqual(err('7 is odd'));
    expect(andThen(err<string>('earlier'), half)).toEqual(err('earlier'));
  });

  it('falls back rather than throwing', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err('bad'), 0)).toBe(0);
  });

  it('throws from expect with the reason attached', () => {
    expect(() => expectOk(err('checksum'), 'reading the batch')).toThrow(
      'reading the batch: checksum',
    );
    expect(expectOk(ok('fine'), 'reading the batch')).toBe('fine');
  });

  it('splits a batch and keeps the order on both sides', () => {
    const rows = [ok(1), err('a'), ok(2), err('b'), ok(3)];
    expect(partition(rows)).toEqual({ values: [1, 2, 3], errors: ['a', 'b'] });
  });

  it('fails the whole collection on the first bad element', () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([ok(1), err('second'), err('third')])).toEqual(err('second'));
  });
});
