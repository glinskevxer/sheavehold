import type { OperatingDate } from '../../util/clock.js';
import type { DayClass } from '../calendar/season.js';
import type { Visit } from '../visit/visit.js';
import type { WeightRule } from './attribution.js';

/**
 * How to split a multi day ticket when an even split is wrong.
 *
 * Even is the default and it is defensible, but it does something the finance
 * office does not like: a five day ticket used on four midweek days and one
 * Saturday puts the same money on the Saturday as on a Tuesday, and the
 * Saturday is worth nearly twice as much at the window. So the rate card
 * weighting exists and the area chooses which one to report on, per season, in
 * writing.
 *
 * Every rule here returns a plain number. Zero means the day gets nothing, and
 * a rule that returns zero for every day falls back to an even split rather
 * than dropping the money, which the apportionment does for us.
 */

/** Days with more rides on them carry more of the ticket. */
export const byRides: WeightRule = (visit) => Math.max(1, visit.rideCount);

/** Vertical, which favours a day somebody skied the top lifts. */
export const byVertical: WeightRule = (visit) => Math.max(1, Math.round(visit.verticalFt / 100));

/** Time on the hill, which is what the food and beverage side prefers. */
export const bySpan: WeightRule = (visit) => Math.max(1, visit.spanMinutes);

export const DEFAULT_CLASS_WEIGHTS: Readonly<Record<DayClass, number>> = {
  midweek: 100,
  weekend: 165,
  holiday: 185,
  peak: 200,
};

/**
 * The rate card. A day is worth what a walk up ticket costs on that class of
 * day, which is the only weighting a guest would recognise as fair.
 */
export function byDayClass(
  classOf: (date: OperatingDate) => DayClass,
  weights: Readonly<Record<DayClass, number>> = DEFAULT_CLASS_WEIGHTS,
): WeightRule {
  return (visit) => weights[classOf(visit.operatingDate)];
}

/**
 * Multi day tickets are bought for a trip and the first day is the one the
 * guest would have paid a walk up price for, so it carries more. The tail
 * decays but never to nothing.
 */
export function frontLoaded(dates: readonly OperatingDate[], decay = 0.85): WeightRule {
  const order = new Map<string, number>();
  [...dates].sort().forEach((date, index) => order.set(date, index));
  return (visit) => {
    const index = order.get(visit.operatingDate) ?? 0;
    return Math.round(100 * decay ** index);
  };
}

/** Multiply two rules together, which is how class and rides combine. */
export function combine(...rules: readonly WeightRule[]): WeightRule {
  return (visit) => rules.reduce((total, rule) => total * Math.max(0, rule(visit)), 1);
}

export function scaled(rule: WeightRule, factor: number): WeightRule {
  return (visit) => Math.max(0, Math.round(rule(visit) * factor));
}

/** Nothing on days the caller wants left out of the split entirely. */
export function excluding(rule: WeightRule, dates: readonly OperatingDate[]): WeightRule {
  const excluded = new Set<string>(dates);
  return (visit) => (excluded.has(visit.operatingDate) ? 0 : rule(visit));
}

export function describeWeights(rule: WeightRule, visits: readonly Visit[]): string[] {
  return visits.map((visit) => `${visit.operatingDate} ${rule(visit)}`);
}
