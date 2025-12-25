import { describe, expect, it } from 'vitest';
import { dedupe, dedupeByTerminal, terminalWindowMs } from '../../src/domain/scan/dedupe.js';
import { normaliseScans } from '../../src/domain/scan/normalise.js';
import { clocks, rawScan, terminals } from '../support/scans.js';
import { CARD_ROW, CARD_TESS } from '../support/media.js';

/**
 * Properties rather than examples. The dedupe rules are the ones most likely
 * to be changed by somebody tuning a window, and an example test tuned to the
 * same numbers moves with them. These do not.
 */

const options = () => ({ terminals: terminals() });
const norm = () => ({ clocks: clocks(), terminals: terminals() });

const GATES = ['SUNB.01', 'SUNB.02', 'SUNB.03', 'MEADW.01', 'BOWL.01', 'CRPT.01'];
const CARDS = [CARD_ROW, CARD_TESS];

/** A small deterministic generator, so a failure can be reproduced exactly. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomDay(seed: number, count: number) {
  const random = makeRandom(seed);
  const base = new Date('2025-01-13T17:00:00Z').getTime();
  let at = base;
  return normaliseScans(
    Array.from({ length: count }, (_, i) => {
      at += Math.floor(random() * 40_000);
      return rawScan({
        terminal: GATES[Math.floor(random() * GATES.length)] ?? 'SUNB.01',
        media: CARDS[Math.floor(random() * CARDS.length)] ?? CARD_ROW,
        at: new Date(at).toISOString(),
        seq: i + 1,
        outcome: random() < 0.15 ? 'reject' : 'accept',
        reason: '',
      });
    }),
    norm(),
  );
}

describe('what dedupe always does', () => {
  const seeds = [1, 7, 19, 41, 97, 233, 517, 1_009];

  it('never invents a scan', () => {
    for (const seed of seeds) {
      const scans = randomDay(seed, 60);
      const result = dedupe(scans, options());
      expect(result.kept.length + result.suppressed.length).toBe(scans.length);
    }
  });

  it('never drops a refusal', () => {
    for (const seed of seeds) {
      const scans = randomDay(seed, 60);
      const rejects = scans.filter((scan) => scan.outcome === 'reject').length;
      const keptRejects = dedupe(scans, options()).kept.filter(
        (scan) => scan.outcome === 'reject',
      ).length;
      expect(keptRejects).toBe(rejects);
    }
  });

  it('keeps at least one read for every card that was accepted anywhere', () => {
    for (const seed of seeds) {
      const scans = randomDay(seed, 60);
      const accepted = new Set(
        scans.filter((scan) => scan.outcome === 'accept').map((scan) => scan.mediaSerial),
      );
      const kept = new Set(
        dedupe(scans, options())
          .kept.filter((scan) => scan.outcome === 'accept')
          .map((scan) => scan.mediaSerial),
      );
      expect([...accepted].every((serial) => kept.has(serial))).toBe(true);
    }
  });

  it('leaves the kept reads in the order they arrived', () => {
    for (const seed of seeds) {
      const kept = dedupe(randomDay(seed, 60), options()).kept;
      const times = kept.map((scan) => scan.at.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it('never keeps two accepted reads of one card at one gate inside the window', () => {
    for (const seed of seeds) {
      const result = dedupeByTerminal(randomDay(seed, 80), options());
      const last = new Map<string, number>();
      for (const scan of result.kept) {
        if (scan.outcome !== 'accept') continue;
        const key = `${scan.terminalId}#${scan.mediaSerial}`;
        const previous = last.get(key);
        if (previous !== undefined) {
          expect(scan.at.getTime() - previous).toBeGreaterThanOrEqual(
            terminalWindowMs(scan, options()),
          );
        }
        last.set(key, scan.at.getTime());
      }
    }
  });

  it('suppresses at least as much with both passes as with one', () => {
    for (const seed of seeds) {
      const scans = randomDay(seed, 80);
      expect(dedupe(scans, options()).suppressed.length).toBeGreaterThanOrEqual(
        dedupeByTerminal(scans, options()).suppressed.length,
      );
    }
  });

  it('is stable when it runs again over what it kept', () => {
    for (const seed of seeds) {
      const once = dedupe(randomDay(seed, 60), options());
      const twice = dedupe(once.kept, options());
      expect(twice.suppressed).toEqual([]);
      expect(twice.kept).toEqual(once.kept);
    }
  });

  it('suppresses nothing when the windows are set to nothing', () => {
    for (const seed of seeds) {
      const scans = randomDay(seed, 40);
      const result = dedupe(scans, {
        terminals: terminals(),
        guardSeconds: 0,
        floorSeconds: 0,
        mazeSeconds: 0,
      });
      expect(result.kept.length).toBeGreaterThanOrEqual(scans.length - result.suppressed.length);
    }
  });
});
