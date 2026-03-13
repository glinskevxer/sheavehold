/**
 * The public surface, for anything embedding this rather than running the
 * command line. It is deliberately narrow: the domain rules, the store and the
 * services, and nothing under `cli`, which is an application rather than a
 * library.
 */

export * from './util/result.js';
export * from './util/ids.js';
export * from './util/clock.js';
export * from './util/money.js';
export * from './util/csv.js';
export * from './util/table.js';
export * from './util/collect.js';
export * from './util/diagnostic.js';

export type { Lift, LiftKind, LiftStatus } from './domain/lift/lift.js';
export { LiftRegistry, makeLift, verticalRiseFt } from './domain/lift/lift.js';
export type { Terminal } from './domain/lift/terminal.js';
export { TerminalRegistry, makeTerminal } from './domain/lift/terminal.js';
export type { Ride } from './domain/ride/ride.js';
export { buildRides } from './domain/ride/ride.js';
export type { Visit } from './domain/visit/visit.js';
export { buildVisits, skierVisits } from './domain/visit/visit.js';

export { ingestUpload } from './service/ingest.js';
export { recomputeDate, recomputeDates } from './service/recompute.js';
export { replayDates } from './service/replay-batch.js';
export { daySummary, periodTotals } from './service/query.js';
export { buildDailyReport } from './report/daily.js';
export { renderDailyReport } from './report/text.js';
export { buildRouter } from './api/build.js';
export { VERSION } from './cli/main.js';
