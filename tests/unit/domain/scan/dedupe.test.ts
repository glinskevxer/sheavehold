import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOOR_SECONDS,
  DEFAULT_GUARD_SECONDS,
  dedupeByTerminal,
  suppressionRate,
  suppressionsByTerminal,
  terminalWindowMs,
} from '../../../../src/domain/scan/dedupe.js';
import { normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { CARD_ROW, CARD_TESS } from '../../../support/media.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';

const norm = () => ({ clocks: clocks(), terminals: terminals() });
const options = () => ({ terminals: terminals() });

interface Spec {
  terminal?: string;
  media?: string;
  at: string;
  outcome?: 'accept' | 'reject';
}

function scans(specs: readonly Spec[]) {
  return normaliseScans(
    specs.map((spec, i) =>
      rawScan({
        terminal: spec.terminal ?? 'MEADW.01',
        media: spec.media ?? CARD_ROW,
        at: spec.at,
        seq: i + 1,
        outcome: spec.outcome ?? 'accept',
        reason: spec.outcome === 'reject' ? 'no entitlement' : '',
      }),
    ),
    norm(),
  );
}

describe('the window', () => {
  it('is the gate dwell plus a guard', () => {
    const [meadow] = scans([{ at: '2025-01-13T18:00:00Z' }]);
    expect(terminalWindowMs(meadow!, options())).toBe((6 + DEFAULT_GUARD_SECONDS) * 1000);
  });

  it('widens for the slow pedestal on Bowl', () => {
    const [bowl] = scans([{ terminal: 'BOWL.01', at: '2025-01-13T18:00:00Z' }]);
    expect(terminalWindowMs(bowl!, options())).toBe(13_000);
  });

  it('never drops below the floor even on the fast carpet reader', () => {
    const [carpet] = scans([{ terminal: 'CRPT.01', at: '2025-01-13T18:00:00Z' }]);
    expect(terminalWindowMs(carpet!, options())).toBe(DEFAULT_FLOOR_SECONDS * 1000);
  });

  it('takes a wider guard when the caller asks', () => {
    const [meadow] = scans([{ at: '2025-01-13T18:00:00Z' }]);
    expect(terminalWindowMs(meadow!, { ...options(), guardSeconds: 10 })).toBe(16_000);
  });
});

describe('deduping one gate', () => {
  it('keeps a single read', () => {
    const result = dedupeByTerminal(scans([{ at: '2025-01-13T18:00:00Z' }]), options());
    expect(result.kept).toHaveLength(1);
    expect(result.suppressed).toEqual([]);
  });

  it('drops a second read inside the window', () => {
    const result = dedupeByTerminal(
      scans([{ at: '2025-01-13T18:00:00Z' }, { at: '2025-01-13T18:00:03Z' }]),
      options(),
    );
    expect(result.kept).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0]).toMatchObject({
      keptSequence: 1,
      gapMs: 3_000,
      reason: 'terminal_debounce',
    });
  });

  it('keeps a second read once the window has passed', () => {
    const result = dedupeByTerminal(
      scans([{ at: '2025-01-13T18:00:00Z' }, { at: '2025-01-13T18:00:09Z' }]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('measures the window from the kept read, not the last dropped one', () => {
    const result = dedupeByTerminal(
      scans([
        { at: '2025-01-13T18:00:00Z' },
        { at: '2025-01-13T18:00:05Z' },
        { at: '2025-01-13T18:00:09Z' },
      ]),
      options(),
    );
    expect(result.kept.map((scan) => scan.sequence)).toEqual([1, 3]);
  });

  it('keeps two different cards apart', () => {
    const result = dedupeByTerminal(
      scans([
        { at: '2025-01-13T18:00:00Z', media: CARD_ROW },
        { at: '2025-01-13T18:00:01Z', media: CARD_TESS },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('keeps two gates apart even in the same maze', () => {
    const result = dedupeByTerminal(
      scans([
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:01Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('never suppresses a refusal', () => {
    const result = dedupeByTerminal(
      scans([
        { at: '2025-01-13T18:00:00Z', outcome: 'reject' },
        { at: '2025-01-13T18:00:01Z', outcome: 'reject' },
        { at: '2025-01-13T18:00:02Z', outcome: 'reject' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(3);
  });

  it('does not let a refusal open a window that hides the ride after it', () => {
    const result = dedupeByTerminal(
      scans([{ at: '2025-01-13T18:00:00Z', outcome: 'reject' }, { at: '2025-01-13T18:00:02Z' }]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('uses the gate that made the second read to size the window', () => {
    const wide = dedupeByTerminal(
      scans([
        { terminal: 'BOWL.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'BOWL.01', at: '2025-01-13T18:00:10Z' },
      ]),
      options(),
    );
    expect(wide.suppressed).toHaveLength(1);
  });
});

describe('what the dedupe says about the gates', () => {
  const result = () =>
    dedupeByTerminal(
      scans([
        { terminal: 'BOWL.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'BOWL.01', at: '2025-01-13T18:00:03Z' },
        { terminal: 'BOWL.01', at: '2025-01-13T18:00:06Z' },
        { terminal: 'MEADW.01', at: '2025-01-13T18:00:00Z' },
      ]),
      options(),
    );

  it('counts what each gate threw away', () => {
    expect([...suppressionsByTerminal(result())]).toEqual([['BOWL.01', 2]]);
  });

  it('gives the share as a percentage', () => {
    expect(suppressionRate(result(), 'BOWL.01')).toBe(66.7);
    expect(suppressionRate(result(), 'MEADW.01')).toBe(0);
    expect(suppressionRate(result(), 'CRPT.01')).toBe(0);
  });
});
