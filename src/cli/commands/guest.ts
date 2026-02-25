import type { Command } from 'commander';
import { operatingDay, parseOperatingDate } from '../../util/clock.js';
import { parseMediaSerial, parsePrintedId } from '../../util/ids.js';
import { formatAreaTime } from '../../util/clock.js';
import {
  guestHistory,
  householdHistory,
  type GuestQueryContext,
} from '../../service/guest-query.js';
import { expect as expectOk } from '../../util/result.js';
import { guestQueryContext } from '../../service/stores.js';
import { renderPairs, renderTable, type Column } from '../../util/table.js';
import type { EntitlementLine } from '../../service/guest-query.js';
import type { CliApp } from '../app.js';
import { markFailed } from '../main.js';
import type { Output } from '../output.js';

/**
 * `sheavehold guest` is the command the ticket office runs while somebody is
 * standing at the window, so it answers from whichever identifier they have:
 * the guest id, the number printed on the card, or the tag serial off a reader.
 */

const entitlementColumns: Column<EntitlementLine>[] = [
  { header: 'entitlement', value: (row) => row.entitlementId },
  { header: 'product', value: (row) => row.productCode },
  { header: 'name', maxWidth: 22, value: (row) => row.productName },
  { header: 'used', align: 'right', value: (row) => String(row.daysUsed.length) },
  {
    header: 'left',
    align: 'right',
    value: (row) => (row.unlimited ? 'many' : String(row.daysLeft)),
  },
  { header: 'state', value: (row) => (row.voided ? 'VOIDED' : 'ok') },
];

function guestContext(app: CliApp, asOf: string): GuestQueryContext {
  const date = parseOperatingDate(asOf);
  const fallback = parseOperatingDate(operatingDay(app.now()));
  return guestQueryContext(app, expectOk(date.ok ? date : fallback, 'as of date'));
}

/** The guest behind whatever identifier the desk typed. */
export function resolveGuestId(app: CliApp, raw: string): string | undefined {
  if (app.reference.guests.has(raw)) return raw;

  const printed = parsePrintedId(raw);
  if (printed.ok) {
    const media = app.reference.media.by('printed', printed.value)[0];
    if (media !== undefined) {
      const binding = app.reference.bindings.resolve(media.serial, app.now());
      if (binding !== undefined) return binding.guestId;
    }
  }

  const serial = parseMediaSerial(raw);
  if (serial.ok) {
    const binding = app.reference.bindings.resolve(serial.value, app.now());
    if (binding !== undefined) return binding.guestId;
  }
  return undefined;
}

export function addGuestCommand(program: Command, app: CliApp, output: Output): void {
  const guest = program.command('guest').description('who a guest is and what they hold');

  guest
    .command('show')
    .description('one guest, by id, printed number or tag serial')
    .argument('<who>', 'guest id, printed card number or tag serial')
    .option('--as-of <date>', 'the date to work the age band out on', '2025-01-13')
    .action((who: string, options: { asOf: string }) => {
      const guestId = resolveGuestId(app, who);
      if (guestId === undefined) {
        output.error(`nothing on file for ${who}`);
        markFailed(program);
        return;
      }
      const history = guestHistory(guestId, guestContext(app, options.asOf));
      if (history === undefined) {
        output.error(`nothing on file for ${who}`);
        markFailed(program);
        return;
      }
      output.lines(
        renderPairs([
          ['guest', `${history.guest.id} ${history.name}`],
          ['age band', history.ageBand ?? 'unknown'],
          ['household', history.householdId ?? 'none'],
          ['days skied', String(history.daysSkied)],
          ['rides', String(history.totalRides)],
          ['vertical', history.totalVerticalFt.toLocaleString('en-US')],
          ['favourite lift', history.favouriteLift ?? 'none'],
        ]),
      );
      output.line('');
      output.lines(renderTable(history.entitlements, entitlementColumns));
      if (history.visits.length > 0) {
        output.line('');
        output.line(
          `last out ${formatAreaTime(history.visits[history.visits.length - 1]!.lastRideAt)}`,
        );
      }
    });

  guest
    .command('household')
    .description('everybody on one account')
    .argument('<household>', 'household id')
    .action((householdId: string) => {
      const rows = householdHistory(householdId, guestContext(app, '2025-01-13'));
      if (rows.length === 0) {
        output.error(`nobody is on household ${householdId}`);
        markFailed(program);
        return;
      }
      output.line(`household ${householdId}`);
      output.lines(
        renderTable(rows, [
          { header: 'guest', value: (row) => row.guest.id },
          { header: 'name', maxWidth: 24, value: (row) => row.name },
          { header: 'days', align: 'right', value: (row) => String(row.daysSkied) },
          { header: 'rides', align: 'right', value: (row) => String(row.totalRides) },
          { header: 'vertical', align: 'right', value: (row) => String(row.totalVerticalFt) },
        ]),
      );
    });
}
