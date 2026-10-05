import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { parseUci, passMove, tryMove } from '@/chess/helpers';
import raw from './threat-positions.json';
import { loadThreatPositions } from './threatData';
import { describeThreat, type ThreatPosition } from './threats';

const POSITIONS = raw as readonly ThreatPosition[];

const legalIn = (fen: string, uci: string) => tryMove(new Chess(fen), parseUci(uci)) !== null;

describe('the bundled threat positions', () => {
  it('are plenty, spread over the rating range, each with its own id', () => {
    expect(POSITIONS.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(POSITIONS.map((p) => p.id)).size).toBe(POSITIONS.length);
    for (const [min, max] of [
      [400, 1000],
      [1000, 1600],
      [1600, 2200],
      [2200, 3000],
    ] as const) {
      expect(POSITIONS.filter((p) => p.rating >= min && p.rating < max).length).toBeGreaterThan(
        150,
      );
    }
    expect(POSITIONS.filter((p) => p.kind === 'mate').length).toBeGreaterThan(100);
  });

  it('replay: the threat after a pass, its line, the defences and the game move', () => {
    const problems: string[] = [];
    for (const p of POSITIONS) {
      const chess = new Chess(p.fen);
      if (chess.inCheck()) problems.push(`${p.id}: in check`);
      const passed = passMove(p.fen);
      if (!passed) {
        problems.push(`${p.id}: cannot pass`);
        continue;
      }
      for (const uci of [p.threat, ...(p.also ?? [])]) {
        if (!legalIn(passed, uci)) problems.push(`${p.id}: threat ${uci} illegal`);
      }
      if (p.line[0] !== p.threat) problems.push(`${p.id}: line does not start with the threat`);
      const line = new Chess(passed);
      for (const uci of p.line) {
        if (!tryMove(line, parseUci(uci))) problems.push(`${p.id}: line move ${uci} illegal`);
      }
      if (p.defences.length === 0) problems.push(`${p.id}: no defence`);
      for (const uci of p.defences) {
        if (!legalIn(p.fen, uci)) problems.push(`${p.id}: defence ${uci} illegal`);
      }
      if (p.game && (!legalIn(p.fen, p.game) || p.defences.includes(p.game))) {
        problems.push(`${p.id}: game move ${p.game}`);
      }
      if (p.kind !== 'mate' && p.kind !== 'material') {
        problems.push(`${p.id}: kind ${String(p.kind)}`);
      }
      if (!describeThreat(p)) problems.push(`${p.id}: cannot be described`);
    }
    expect(problems).toEqual([]);
    // Every one of the 1,200 positions replayed with chess.js: seconds on a busy machine.
  }, 60_000);

  it('load in a chunk of their own', async () => {
    const loaded = await loadThreatPositions();
    expect(loaded).toHaveLength(POSITIONS.length);
    expect(await loadThreatPositions()).toBe(loaded);
  });
});
