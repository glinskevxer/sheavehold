import { err, ok, type Result } from './result.js';

/**
 * Money is whole cents in a number, never a float dollar amount. Everything the
 * revenue side does is apportionment: a five day ticket sold for one price gets
 * spread over the days it was used, a season pass gets spread over the visits
 * it produced. Apportionment with rounding is where the cents go missing, so
 * the split here is largest remainder and it is exact by construction.
 */

export type Cents = number & { readonly __cents: unique symbol };

const MONEY_PATTERN = /^-?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) throw new Error(`${value} is not a whole number of cents`);
  if (!Number.isSafeInteger(value)) throw new Error(`${value} is outside the safe integer range`);
  return value as Cents;
}

export const ZERO = cents(0);

export function parseMoney(raw: string): Result<Cents> {
  const trimmed = raw.trim();
  const match = MONEY_PATTERN.exec(trimmed);
  if (match === null) return err(`amount ${JSON.stringify(raw)} is not a money value`);
  const whole = (match[1] ?? '0').replace(/,/g, '');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const magnitude = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(magnitude)) return err(`amount ${trimmed} is too large`);
  return ok(cents(trimmed.startsWith('-') ? -magnitude : magnitude));
}

export function formatMoney(value: Cents): string {
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${fraction}`;
}

export function addMoney(...values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) total += value;
  return cents(total);
}

export function subtractMoney(left: Cents, right: Cents): Cents {
  return cents(left - right);
}

export function negateMoney(value: Cents): Cents {
  return cents(0 - value);
}

/** Half away from zero, which is what the finance office rounds by hand. */
export function scaleMoney(value: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) throw new Error(`factor ${factor} is not finite`);
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return cents(rounded);
}

/**
 * Split an amount into n parts by weight, exactly. Every part gets the floor of
 * its share and the remaining cents go one each to the largest remainders, so
 * the parts always sum back to the input. Ties break toward the earlier index,
 * which for our callers means the earlier day on the ticket.
 */
export function apportion(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) throw new Error('apportion does not take a negative weight');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => ZERO);

  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((value) => Math.floor(value));
  const distributed = floors.reduce((a, b) => a + b, 0);
  let leftover = total - distributed;

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const out = floors.slice();
  let cursor = 0;
  while (leftover > 0 && order.length > 0) {
    const slot = order[cursor % order.length];
    if (slot === undefined) break;
    out[slot.index] = (out[slot.index] ?? 0) + 1;
    leftover -= 1;
    cursor += 1;
  }
  while (leftover < 0 && order.length > 0) {
    const slot = order[order.length - 1 - (cursor % order.length)];
    if (slot === undefined) break;
    out[slot.index] = (out[slot.index] ?? 0) - 1;
    leftover += 1;
    cursor += 1;
  }
  return out.map((value) => cents(value));
}

/** Equal shares, which is the common case and worth not spelling out. */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts < 0) throw new Error(`${parts} is not a part count`);
  return apportion(total, new Array<number>(parts).fill(1));
}

export function sumMoney(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) total += value;
  return cents(total);
}

export function compareMoney(left: Cents, right: Cents): number {
  return left - right;
}
