import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { parsePlacement, placementField } from '@/chess/geometry';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { replayGame } from './arbiter';
import {
  ALL_KINDS,
  type ArbiterPosition,
  type IllegalKind,
  illegalMoves,
  KIND_TIER,
  KIND_TITLES,
} from './arbiterMoves';

/** The placements every legal move of `fen` leads to. */
function legalPlacements(fen: string): Set<string> {
  const chess = new Chess(fen);
  return new Set(chess.moves({ verbose: true }).map((m) => m.after.split(' ')[0] ?? ''));
}

function at(fen: string, history: ArbiterPosition['history'] = []): ArbiterPosition {
  return { fen, history };
}

const GAMES = CLASSIC_GAMES.map(replayGame);

describe('illegal moves in the classic games', () => {
  it('finds every kind somewhere, and none of them is legal', () => {
    // Every kind, at every position of every classic game: each move found is one chess.js
    // refuses, the board it leaves is readable, and its explanation says something.
    const found = new Map<IllegalKind, number>();
    for (const game of GAMES) {
      game.positions.forEach((fen, index) => {
        const position = at(fen, game.moves.slice(0, index));
        const legal = legalPlacements(fen);
        for (const kind of ALL_KINDS) {
          for (const move of illegalMoves(position, kind)) {
            found.set(kind, (found.get(kind) ?? 0) + 1);
            const after = move.fen.split(' ')[0] ?? '';
            if (legal.has(after)) {
              throw new Error(`${kind} ${move.from}-${move.to} in ${fen} is a legal move`);
            }
            if (placementField(parsePlacement(move.fen)) !== after) {
              throw new Error(`${kind} leaves an unreadable board: ${move.fen}`);
            }
            if (move.reason.length < 20 || move.from === move.to) {
              throw new Error(`${kind} ${move.from}-${move.to} has no proper reason`);
            }
          }
        }
      });
    }
    for (const kind of ALL_KINDS) {
      expect(found.get(kind) ?? 0, kind).toBeGreaterThan(0);
    }
    // Two thousand positions, each tried for every kind.
  }, 120_000);

  it('names and tiers every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(KIND_TITLES[kind].length).toBeGreaterThan(5);
      expect([1, 2, 3]).toContain(KIND_TIER[kind]);
    }
  });
});

describe('each kind, on a position made for it', () => {
  it('a knight off its L, with the squares it could have gone to', () => {
    const [move] = illegalMoves(at('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1'), 'knight-shape');
    expect(move?.hints.sort()).toEqual(['a3', 'c3', 'd2']);
    expect(move?.reason).toContain('not an L');
  });

  it('a pinned knight leaving the line to its king', () => {
    // The bishop on b4 pins the knight on c3 to the king on e1.
    const moves = illegalMoves(at('4k3/8/8/8/1b6/2N5/8/4K3 w - - 0 1'), 'pinned-piece');
    expect(moves.length).toBe(8);
    const [move] = moves;
    expect(move?.from).toBe('c3');
    expect(move?.arrows).toEqual([['b4', 'e1']]);
    expect(move?.marks).toEqual(['b4']);
    expect(move?.reason).toMatch(/pinned.*bishop on b4.*king on e1/);
  });

  it('a pinned piece moving along its line is not offered', () => {
    // The rook on e2 is pinned on the e-file; e2-e3 and Rxe7 stay on the line.
    const moves = illegalMoves(at('4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1'), 'pinned-piece');
    expect(moves.map((m) => m.to)).not.toContain('e3');
    expect(moves.map((m) => m.to)).not.toContain('e7');
    expect(moves.map((m) => m.to)).toContain('d2');
  });

  it('a king walking into check, and next to the other king', () => {
    const into = illegalMoves(at('3rk3/8/8/8/8/8/8/4K3 w - - 0 1'), 'king-into-check');
    expect(into.map((m) => m.to).sort()).toEqual(['d1', 'd2']);
    expect(into[0]?.reason).toContain('rook on d8');
    const kings = illegalMoves(at('8/8/8/3k4/8/3K4/8/8 w - - 0 1'), 'king-into-check');
    expect(kings.map((m) => m.to).sort()).toEqual(['c4', 'd4', 'e4']);
    expect(kings[0]?.reason).toContain('next to each other');
  });

  it('a check ignored', () => {
    const moves = illegalMoves(at('4k3/8/8/8/7b/8/P7/4K3 w - - 0 1'), 'ignores-check');
    expect(moves.map((m) => m.san).sort()).toEqual(['a3', 'a4']);
    expect(moves[0]?.arrows).toEqual([['h4', 'e1']]);
  });

  it('castling out of check, through an attacked square and into one', () => {
    const out = illegalMoves(at('4k3/4r3/8/8/8/8/8/4K2R w K - 0 1'), 'castle-through-check');
    expect(out[0]?.reason).toContain('out of check');
    const through = illegalMoves(at('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), 'castle-through-check');
    expect(through).toEqual([]);
    const crossing = illegalMoves(at('3rk3/8/8/8/8/8/8/R3K3 w Q - 0 1'), 'castle-through-check');
    expect(crossing[0]?.san).toBe('O-O-O');
    expect(crossing[0]?.reason).toContain('d1 is attacked');
    const landing = illegalMoves(at('4k1r1/8/8/8/8/8/8/4K2R w K - 0 1'), 'castle-through-check');
    expect(landing[0]?.reason).toContain('g1 is attacked');
    expect(landing[0]?.fen.split(' ')[0]).toBe('4k1r1/8/8/8/8/8/8/5RK1');
  });

  it('en passant a move too late, never the legal one', () => {
    // Black's pawn came to d5 with a double step just now: exd6 is legal, so it is not offered.
    const now = illegalMoves(
      at('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', [
        { from: 'd7', to: 'd5', san: 'd5', piece: 'p', color: 'b' },
      ]),
      'late-en-passant',
    );
    expect(now).toEqual([]);
    const later = illegalMoves(
      at('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 3', [
        { from: 'd7', to: 'd5', san: 'd5', piece: 'p', color: 'b' },
        { from: 'e1', to: 'e2', san: 'Ke2', piece: 'k', color: 'w' },
        { from: 'e8', to: 'e7', san: 'Ke7', piece: 'k', color: 'b' },
      ]),
      'late-en-passant',
    );
    expect(later[0]?.san).toBe('exd6');
    expect(later[0]?.fen.split(' ')[0]).toBe('4k3/8/3P4/8/8/8/8/4K3');
  });

  it('a pawn that reaches the end and stays a pawn', () => {
    const [move] = illegalMoves(at('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), 'no-promotion');
    expect(move?.san).toBe('a8');
    expect(move?.fen.split(' ')[0]).toBe('P3k3/8/8/8/8/8/8/4K3');
  });

  it('the side that just moved, moving again', () => {
    const history = [{ from: 'e2', to: 'e4', san: 'e4', piece: 'p', color: 'w' }] as const;
    const moves = illegalMoves(
      at('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', [...history]),
      'moves-twice',
    );
    expect(moves.length).toBeGreaterThan(20);
    expect(moves.every((m) => m.color === 'w')).toBe(true);
    expect(moves[0]?.reason).toContain('White moved twice in a row: after 1.e4');
  });

  it('a slider jumping over a piece, marking the piece in the way', () => {
    const moves = illegalMoves(at('4k3/8/8/8/8/8/1P6/B3K3 w - - 0 1'), 'jumps-over');
    expect(moves.map((m) => m.to).sort()).toEqual(['c3', 'd4', 'e5', 'f6', 'g7', 'h8']);
    expect(moves[0]?.marks).toEqual(['b2']);
  });

  it('pawn moves of every wrong shape', () => {
    const fen = '4k3/8/8/8/3p4/2n1P3/1P6/4K3 w - - 0 1';
    expect(illegalMoves(at(fen), 'pawn-backwards').map((m) => m.to)).toEqual(['e2']);
    expect(illegalMoves(at(fen), 'pawn-late-double').map((m) => m.to)).toEqual(['e5']);
    expect(
      illegalMoves(at(fen), 'pawn-diagonal-step')
        .map((m) => m.to)
        .sort(),
    ).toEqual(['a3', 'f4']);
    expect(illegalMoves(at('4k3/8/8/8/8/1n6/1P6/4K3 w - - 0 1'), 'pawn-blocked-double')).toEqual([
      expect.objectContaining({ to: 'b4', marks: ['b3'] }),
    ]);
    expect(
      illegalMoves(at('4k3/8/8/8/8/1n6/1P6/4K3 w - - 0 1'), 'pawn-straight-capture')[0]?.san,
    ).toBe('bxb3');
  });
});
