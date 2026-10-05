import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import threatPositions from '@/features/drills/threat-positions.json';
import { toUci } from './helpers';
import {
  type QuickMove,
  QuickBoard,
  quickInput,
  quickUci,
  squareIndex,
  squareName,
} from './quickBoard';
import { START_FEN } from './startFen';

function perft(board: QuickBoard, depth: number): number {
  const moves = board.moves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    board.make(move);
    nodes += perft(board, depth - 1);
    board.unmake();
  }
  return nodes;
}

/** The standard test positions and their move counts by depth (chessprogramming.org "Perft Results"). */
const PERFT: [name: string, fen: string, counts: number[]][] = [
  ['the start', START_FEN, [20, 400, 8902, 197281]],
  [
    'Kiwipete',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    [48, 2039, 97862],
  ],
  [
    'position 3 (en passant pins)',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    [14, 191, 2812, 43238],
  ],
  [
    'position 4 (promotions, castling)',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    [6, 264, 9467],
  ],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  [
    'position 6',
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    [46, 2079, 89890],
  ],
];

/** chess.js's legal moves, as UCI, in its order. */
const chessJsMoves = (chess: Chess) => chess.moves({ verbose: true }).map((m) => toUci(m));

/** A seeded pseudo-random sequence (mulberry32), so the games below are the same every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('QuickBoard', () => {
  it.each(PERFT)('counts the moves from %s as every move generator must', (_name, fen, counts) => {
    const board = QuickBoard.fromFen(fen);
    const before = board.moves().map(quickUci);
    counts.forEach((count, i) => {
      expect(perft(board, i + 1)).toBe(count);
    });
    // Every move made was taken back.
    expect(board.moves().map(quickUci)).toEqual(before);
  });

  it('lists the same moves as chess.js, in the same order, through whole games', () => {
    const next = random(15);
    for (let game = 0; game < 16; game++) {
      const chess = new Chess();
      const quick = QuickBoard.fromFen(START_FEN);
      for (let ply = 0; ply < 120 && !chess.isGameOver(); ply++) {
        const verbose = chess.moves({ verbose: true });
        const moves = quick.moves();
        expect(moves.map(quickUci)).toEqual(verbose.map((m) => toUci(m)));
        expect(quick.inCheck()).toBe(chess.inCheck());
        expect(quick.hasMove()).toBe(verbose.length > 0);
        // Captures and promotions only: the same moves, the same order.
        expect(quick.captures().map(quickUci)).toEqual(
          verbose
            .filter((m) => m.captured !== undefined || m.promotion !== undefined)
            .map((m) => toUci(m)),
        );
        const move: QuickMove | undefined = moves[Math.floor(next() * moves.length)];
        if (!move) break;
        chess.move(quickInput(move));
        quick.make(move);
      }
    }
    // chess.js's own move lists are the slow part: seconds on a busy machine.
  }, 60_000);

  it('agrees with chess.js two moves deep from the bundled threat positions', () => {
    const positions = (threatPositions as { fen: string }[]).filter((_, i) => i % 60 === 0);
    for (const { fen } of positions) {
      const chess = new Chess(fen);
      const quick = QuickBoard.fromFen(fen);
      for (const move of quick.moves()) {
        chess.move(quickInput(move));
        quick.make(move);
        expect(quick.moves().map(quickUci), `${fen} after ${quickUci(move)}`).toEqual(
          chessJsMoves(chess),
        );
        quick.unmake();
        chess.undo();
      }
    }
  }, 60_000);

  it('finds en passant only where chess.js does, and takes it back exactly', () => {
    // After ...d5 next to the e5 pawn, exd6 is legal; with the king pinned along the rank it is not.
    const open = QuickBoard.fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    expect(open.moves().map(quickUci)).toContain('e5d6');
    const pinned = QuickBoard.fromFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 2');
    expect(pinned.moves().map(quickUci)).not.toContain('e5d6');
    const capture = open.moves().find((m) => quickUci(m) === 'e5d6');
    if (!capture) throw new Error('no en passant');
    const before = open.moves().map(quickUci);
    open.make(capture);
    // The pawn taken is gone: Black's king can walk to d5.
    expect(open.moves().map(quickUci)).toContain('e8d7');
    open.unmake();
    expect(open.moves().map(quickUci)).toEqual(before);
  });

  it('names squares as chess.js does', () => {
    expect(squareName(0)).toBe('a8');
    expect(squareName(119)).toBe('h1');
    expect(squareIndex('e1')).toBe(116);
    expect(squareIndex(squareName(37))).toBe(37);
    expect(quickInput({ from: 20, to: 4, piece: 1, captured: 0, promotion: 2, flags: 17 })).toEqual(
      {
        from: 'e7',
        to: 'e8',
        promotion: 'n',
      },
    );
  });
});
