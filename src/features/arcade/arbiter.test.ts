import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import { CLASSIC_GAMES, getClassicGame } from '@/features/classics/games';
import {
  buildRound,
  callWindowMs,
  describeArbiter,
  formatSeconds,
  leadInMs,
  pickKind,
  replayGame,
  stepMs,
  tierForRound,
} from './arbiter';
import { ALL_KINDS, KIND_TIER } from './arbiterMoves';

const GAMES = CLASSIC_GAMES.map(replayGame);

describe('replaying a classic game', () => {
  it('reads every move with the position it leaves', () => {
    const opera = getClassicGame('opera-game');
    if (!opera) throw new Error('missing game');
    const game = replayGame(opera);
    expect(game.moves).toHaveLength(33);
    expect(game.positions).toHaveLength(34);
    expect(game.moves[0]).toMatchObject({
      from: 'e2',
      to: 'e4',
      san: 'e4',
      piece: 'p',
      color: 'w',
    });
    expect(game.moves[32]?.san).toBe('Rd8#');
    expect(game.positions[33]).toBe(game.moves[32]?.fen);
    expect(game.caption).toBe('Paul Morphy v Duke of Brunswick & Count Isouard, 1858');
  });

  it('replays all the classic games to their last move', () => {
    for (const [i, game] of GAMES.entries()) {
      const source = CLASSIC_GAMES[i];
      expect(game.moves.length, game.id).toBe(source?.moves.split(/\s+/).filter(Boolean).length);
    }
  });
});

describe('rounds', () => {
  it('get subtler as the run goes on', () => {
    expect([1, 2, 3].map(tierForRound)).toEqual([1, 1, 1]);
    expect([4, 7].map(tierForRound)).toEqual([2, 2]);
    expect([8, 30].map(tierForRound)).toEqual([3, 3]);
  });

  it('pick a kind of the round’s tier, or now and then the one below, avoiding recent ones', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 200; i++) {
      expect(KIND_TIER[pickKind(1, random)]).toBe(1);
      expect([2, 3]).toContain(KIND_TIER[pickKind(9, random)]);
    }
    const recent = ALL_KINDS.filter((k) => KIND_TIER[k] === 1 && k !== 'own-capture');
    for (let i = 0; i < 50; i++) expect(pickKind(1, random, recent)).toBe('own-capture');
  });

  it('build a stretch of real moves that leads to an illegal one, in any round', () => {
    const random = seededRandom(11);
    for (let round = 1; round <= 14; round++) {
      for (let i = 0; i < 6; i++) {
        const r = buildRound(GAMES, round, random);
        if (!r) throw new Error('no round');
        expect(r.lead.length).toBeGreaterThanOrEqual(2);
        expect(r.lead.length).toBeLessThanOrEqual(6);
        // The lead moves are the game's own, from the start position on.
        const chess = new Chess(r.startFen);
        for (const move of r.lead) expect(chess.move(move.san).after).toBe(move.fen);
        // And the illegal move is one chess.js refuses there.
        const before = r.lead[r.lead.length - 1]?.fen ?? r.startFen;
        const legal = new Chess(before).moves({ verbose: true }).map((m) => m.after.split(' ')[0]);
        expect(legal).not.toContain(r.illegal.fen.split(' ')[0]);
        expect(r.title.length).toBeGreaterThan(3);
      }
    }
  });

  it('find the rare kinds too, across the whole collection', () => {
    // A tier-3 round asked for again and again meets every tier-3 kind.
    const random = seededRandom(5);
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) seen.add(buildRound(GAMES, 10, random)?.illegal.kind ?? '');
    for (const kind of ALL_KINDS.filter((k) => KIND_TIER[k] === 3)) {
      expect(seen.has(kind), kind).toBe(true);
    }
  });

  it('have nothing to build from without games', () => {
    expect(buildRound([], 1)).toBeNull();
  });
});

describe('the clock', () => {
  it('speeds up every round, down to a floor', () => {
    expect(stepMs(1, 'normal')).toBe(1700);
    expect(stepMs(2, 'normal')).toBeLessThan(1700);
    expect(stepMs(40, 'normal')).toBe(650);
    expect(stepMs(1, 'slow')).toBe(3000);
    expect(stepMs(40, 'slow')).toBe(1400);
    expect(leadInMs(1, 'normal')).toBeGreaterThan(stepMs(1, 'normal'));
    expect(callWindowMs(5, 'normal')).toBe(stepMs(5, 'normal') + 250);
  });

  it('says what a run was worth', () => {
    expect(describeArbiter(1)).toBe('1 illegal move caught');
    expect(describeArbiter(7)).toBe('7 illegal moves caught');
    expect(describeArbiter(3, 'slow')).toBe('3 illegal moves caught at the slow pace');
    expect(formatSeconds(480)).toBe('0.48 s');
  });
});
