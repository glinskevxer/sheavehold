import { BindingLedger, makeBinding, type Binding } from '../../src/domain/media/binding.js';
import { makeMedia, type Media } from '../../src/domain/media/media.js';
import { parseMediaSerial, type MediaSerial } from '../../src/util/ids.js';
import { expect as expectOk } from '../../src/util/result.js';

export const serial = (raw: string): MediaSerial => expectOk(parseMediaSerial(raw), 'serial');

export const CARD_ROW = serial('E2004A1B00000123');
export const CARD_TESS = serial('E2004A1B00000456');
export const CARD_MILO = serial('E2004A1B00000789');
export const CARD_IDA = serial('E2004A1B00000ABC');
export const CARD_LOOSE = serial('E2004A1B00000DEF');

function media(
  s: MediaSerial,
  printed: string,
  overrides: Partial<Parameters<typeof makeMedia>[0]> = {},
): Media {
  return expectOk(
    makeMedia({
      serial: s,
      printedId: printed,
      form: 'hard_card',
      issuedAt: new Date('2024-11-20T17:00:00Z'),
      status: 'active',
      ...overrides,
    }),
    'media',
  );
}

export const ALL_MEDIA: readonly Media[] = [
  media(CARD_ROW, '4021-8830-1174'),
  media(CARD_TESS, '4021-8830-9902'),
  media(CARD_MILO, '4021-8830-3310'),
  media(CARD_IDA, '4021-8830-7745'),
  media(CARD_LOOSE, '4021-8830-0001', { status: 'destroyed' }),
];

export function mediaMap(): Map<string, Media> {
  return new Map(ALL_MEDIA.map((entry) => [entry.serial, entry]));
}

function bind(s: MediaSerial, entitlementId: string, guestId: string): Binding {
  return expectOk(
    makeBinding({ serial: s, entitlementId, guestId, from: new Date('2024-11-22T00:00:00Z') }),
    'binding',
  );
}

export function bindings(): BindingLedger {
  return BindingLedger.from([
    bind(CARD_ROW, 'ENT-1001', 'G-77'),
    bind(CARD_TESS, 'ENT-1002', 'G-78'),
    bind(CARD_MILO, 'ENT-1003', 'G-79'),
    bind(CARD_IDA, 'ENT-2001', 'G-91'),
  ]);
}
