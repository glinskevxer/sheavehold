import { groupBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import { designCapacityPerHour, type Lift, type LiftRegistry } from '../lift/lift.js';
import { compareRides, type Ride } from '../ride/ride.js';
import { hourLabel, hourOf } from './capacity.js';

/**
 * There is no queue sensor. What there is, is the spacing between boardings,
 * and a lift running at its rated speed with a queue behind it boards people at
 * a very regular interval. A lift with no queue boards them in bursts with long
 * empty stretches between.
 *
 * So the proxy is the regularity, not the rate. A lift at half capacity but
 * perfectly evenly spaced has a queue and a slow rope; a lift at half capacity
 * in bursts is simply quiet. Reporting the rate alone told the lift committee
 * the opposite of the truth for two seasons.
 */

export interface QueueReading {
  readonly lift: LiftCode;
  readonly hour: number;
  readonly label: string;
  readonly boardings: number;
  /** Mean seconds between one boarding and the next. */
  readonly meanGapSeconds: number;
  /** How irregular the spacing is. Near zero means a steady queue. */
  readonly spread: number;
  readonly utilisationPercent: number;
  readonly queueLikely: boolean;
}

/** Below this spread the boardings are regular enough to mean a queue. */
export const STEADY_SPREAD = 0.6;

/** And below this share of design capacity nobody is queuing whatever the spread. */
export const QUIET_UTILISATION = 15;

function gapsSeconds(rides: readonly Ride[]): number[] {
  const ordered = [...rides].sort(compareRides);
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous === undefined || current === undefined) continue;
    gaps.push((current.boardedAt.getTime() - previous.boardedAt.getTime()) / 1000);
  }
  return gaps;
}

/** Coefficient of variation, which is the spread the report reads. */
export function spreadOf(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.round((Math.sqrt(variance) / mean) * 100) / 100;
}

export function readQueue(lift: Lift, rides: readonly Ride[], hour: number): QueueReading {
  const own = rides.filter((ride) => ride.lift === lift.code && hourOf(ride) === hour);
  const gaps = gapsSeconds(own);
  const mean =
    gaps.length === 0 ? 0 : Math.round(gaps.reduce((total, gap) => total + gap, 0) / gaps.length);
  const perHour = designCapacityPerHour(lift);
  const utilisation = perHour === 0 ? 0 : Math.round((own.length / perHour) * 1000) / 10;
  const spread = spreadOf(gaps);

  return {
    lift: lift.code,
    hour,
    label: hourLabel(hour),
    boardings: own.length,
    meanGapSeconds: mean,
    spread,
    utilisationPercent: utilisation,
    queueLikely: own.length >= 4 && spread <= STEADY_SPREAD && utilisation >= QUIET_UTILISATION,
  };
}

export function queueProfile(lifts: LiftRegistry, rides: readonly Ride[]): QueueReading[] {
  const out: QueueReading[] = [];
  for (const [lift, own] of groupBy(rides, (ride) => ride.lift)) {
    const record = lifts.find(lift);
    if (record === undefined) continue;
    for (const hour of [...new Set(own.map(hourOf))].sort((a, b) => a - b)) {
      out.push(readQueue(record, own, hour));
    }
  }
  return out.sort((a, b) => a.lift.localeCompare(b.lift) || a.hour - b.hour);
}

export function likelyQueues(lifts: LiftRegistry, rides: readonly Ride[]): QueueReading[] {
  return queueProfile(lifts, rides).filter((reading) => reading.queueLikely);
}
