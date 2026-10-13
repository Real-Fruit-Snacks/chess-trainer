import { describe, expect, it } from 'vitest';
import { Chess960Game, chess960StartFen } from '@/chess/chess960';
import { rulesFor } from '@/chess/rules';
import type { EngineClient, SearchParams, SearchResult } from '@/engine/EngineClient';
import type { SearchInfo } from '@/engine/uci';
import { reviewGame } from './gameReview';

/** Position 274, BNRKNBRQ: both kings may castle long at once. */
const START = chess960StartFen(274);

/** What the fake engine says in a position (by its placement and side to move). */
interface Scripted {
  cp: number;
  best: string;
  /** Scores of moves searched on their own (`searchmoves`), for the side to move. */
  only?: Record<string, number>;
}

/** The position a search is about, replayed by Chess960's rules (and only those). */
function positionOf(params: SearchParams): string {
  if (!params.chess960) throw new Error('A Chess960 position searched in standard mode');
  const game = new Chess960Game(params.fen);
  for (const uci of params.moves ?? []) {
    if (!game.move(uci)) throw new Error(`Not a move here: ${uci}`);
  }
  return game.fen().split(' ').slice(0, 2).join(' ');
}

function fakeEngine(script: Record<string, Scripted>, calls: SearchParams[]): EngineClient {
  const search = (params: SearchParams) => {
    calls.push(params);
    const key = positionOf(params);
    const scripted = script[key] ?? { cp: 0, best: '' };
    const lines = new Map<number, SearchInfo>();
    const moves = params.searchmoves ?? [scripted.best];
    moves.forEach((uci, i) => {
      const cp = params.searchmoves ? (scripted.only?.[uci] ?? 0) : scripted.cp;
      lines.set(i + 1, {
        depth: params.depth ?? 12,
        multipv: i + 1,
        score: { type: 'cp', value: cp },
        pv: [uci],
      });
    });
    const result: SearchResult = {
      bestmove: { move: scripted.best || null },
      lines,
      stopped: false,
    };
    return { id: calls.length, stop: () => undefined, result: Promise.resolve(result) };
  };
  return { search } as unknown as EngineClient;
}

/** The placement and side to move after these moves from the start. */
function after(...moves: string[]): string {
  return positionOf({ fen: START, moves, chess960: true });
}

describe('reviewGame in Chess960', () => {
  it('replays and searches by Chess960 rules, castling as king takes rook', async () => {
    const script: Record<string, Scripted> = {
      [after()]: { cp: 30, best: 'd1c1' },
      // After 1.e4: Black to move, level.
      [after('e2e4')]: { cp: -25, best: 'd8c8' },
      [after('e2e4', 'd8c8')]: {
        cp: 30,
        best: 'e1f3',
        // Castling long now is a blunder (scripted): the second look agrees.
        only: { e1f3: 30, d1c1: -600 },
      },
      // After 2.O-O-O?? Black is winning.
      [after('e2e4', 'd8c8', 'd1c1')]: { cp: 600, best: 'e8d6' },
    };
    const calls: SearchParams[] = [];
    const rules = rulesFor('chess960');
    const replay = rules.replay(START);
    const moves = ['e4', 'O-O-O', 'O-O-O'].map((san) => {
      const move = replay.play(san);
      if (!move) throw new Error(san);
      return move;
    });
    const summary = await reviewGame(fakeEngine(script, calls), START, moves, {
      depth: 10,
      chess960: true,
    });

    // Every search ran in Chess960 mode, and the engine got castling as king takes rook.
    expect(calls.length).toBeGreaterThan(4);
    expect(calls.every((c) => c.chess960 === true)).toBe(true);
    expect(calls.some((c) => c.moves?.join(' ') === 'e2e4 d8c8 d1c1')).toBe(true);

    const [first, second, third] = summary.moves;
    expect(summary.moves.map((m) => m.san)).toEqual(['e4', 'O-O-O', 'O-O-O']);
    // 1.e4 was not the engine's choice: the better move is named in SAN.
    expect(first?.best).toBe('O-O-O');
    expect(first?.bestUci).toBe('d1c1');
    expect(first?.fen).toBe(START);
    // Black castled as the engine would have.
    expect(second?.judgement).toBe('best');
    // White's castling gave the game away; the review looked again and at the threat.
    expect(third?.judgement).toBe('blunder');
    expect(third?.best).toBe('Nf3');
    expect(third?.fen).toBe(moves[1]?.after);
    expect(calls.some((c) => c.searchmoves?.includes('d1c1'))).toBe(true);
    // The threat search passes the move: Black to move in the position before 2.O-O-O.
    expect(calls.some((c) => c.fen.split(' ')[1] === 'b' && (c.moves ?? []).length === 0)).toBe(
      true,
    );
  });
});
