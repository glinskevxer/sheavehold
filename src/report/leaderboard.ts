import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { groupBy, sumBy } from '../util/collect.js';
import { displayName } from '../domain/guest/guest.js';
import { leaderboard, type LeaderboardEntry } from '../domain/vertical/vertical.js';
import { truncate, type Column } from '../util/table.js';
import { renderDocument, tableSection, type ReportDocument } from './writer.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * The end of season email. Two lists, because guests care about different
 * things: the biggest single day, and the biggest season.
 *
 * Anybody who has opted out of marketing is left off both. That is not a
 * courtesy, it is the rule the area agreed to, and doing it here rather than in
 * the mail merge means nobody can forget.
 */

export interface LeaderRow {
  readonly rank: number;
  readonly guestId: string;
  readonly name: string;
  readonly verticalFt: number;
  readonly rides: number;
  readonly days: number;
  readonly date: OperatingDate | undefined;
}

export interface LeaderboardReport {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly bestDays: readonly LeaderRow[];
  readonly bestSeasons: readonly LeaderRow[];
  readonly excludedForMarketing: number;
}

export interface LeaderboardContext {
  readonly reference: ReferenceStore;
  readonly rides: RideStore;
}

export function buildLeaderboard(
  from: OperatingDate,
  to: OperatingDate,
  context: LeaderboardContext,
  limit = 10,
): LeaderboardReport {
  const dates = new Set<string>(operatingDateRange(from, to));
  const all = context.rides.rides.all().filter((ride) => dates.has(ride.operatingDate));

  const optedIn = new Set(
    context.reference.guests
      .all()
      .filter((guest) => guest.marketingOptIn)
      .map((guest) => guest.id),
  );
  const rides = all.filter((ride) => optedIn.has(ride.guestId));
  const excluded = new Set(all.filter((ride) => !optedIn.has(ride.guestId)).map((r) => r.guestId));

  const nameOf = (guestId: string): string => {
    const guest = context.reference.guests.get(guestId);
    return guest === undefined ? guestId : displayName(guest);
  };

  const bestDays: LeaderRow[] = leaderboard(rides, { limit }).map(
    (entry: LeaderboardEntry, index) => ({
      rank: index + 1,
      guestId: entry.guestId,
      name: nameOf(entry.guestId),
      verticalFt: entry.verticalFt,
      rides: entry.rideCount,
      days: 1,
      date: entry.date,
    }),
  );

  const seasons: LeaderRow[] = [];
  for (const [guestId, own] of groupBy(rides, (ride) => ride.guestId)) {
    seasons.push({
      rank: 0,
      guestId,
      name: nameOf(guestId),
      verticalFt: sumBy(own, (ride) => ride.verticalFt),
      rides: own.length,
      days: new Set(own.map((ride) => ride.operatingDate)).size,
      date: undefined,
    });
  }
  seasons.sort((a, b) => b.verticalFt - a.verticalFt || a.guestId.localeCompare(b.guestId));

  return {
    from,
    to,
    bestDays,
    bestSeasons: seasons.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 })),
    excludedForMarketing: excluded.size,
  };
}

const dayColumns: Column<LeaderRow>[] = [
  { header: 'rank', align: 'right', value: (row) => String(row.rank) },
  { header: 'guest', maxWidth: 24, value: (row) => truncate(row.name, 24) },
  { header: 'date', value: (row) => row.date ?? '' },
  { header: 'vertical', align: 'right', value: (row) => row.verticalFt.toLocaleString('en-US') },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
];

const seasonColumns: Column<LeaderRow>[] = [
  { header: 'rank', align: 'right', value: (row) => String(row.rank) },
  { header: 'guest', maxWidth: 24, value: (row) => truncate(row.name, 24) },
  { header: 'days', align: 'right', value: (row) => String(row.days) },
  { header: 'vertical', align: 'right', value: (row) => row.verticalFt.toLocaleString('en-US') },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
];

export function leaderboardDocument(report: LeaderboardReport): ReportDocument {
  return {
    title: `vertical leaderboard  ${report.from} to ${report.to}`,
    sections: [
      tableSection(report.bestDays, dayColumns, {
        heading: 'biggest days',
        emptyNote: 'nobody skied in this period',
      }),
      tableSection(report.bestSeasons, seasonColumns, {
        heading: 'biggest seasons',
        emptyNote: 'nobody skied in this period',
      }),
    ],
    footer: [`${report.excludedForMarketing} guests left off, having opted out`],
  };
}

export function renderLeaderboard(report: LeaderboardReport): string[] {
  return renderDocument(leaderboardDocument(report));
}
