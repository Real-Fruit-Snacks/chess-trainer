import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { legalDests } from '@/chess/helpers';
import type { Fen, LongColor } from '@/chess/types';
import type { Puzzle } from '@/features/puzzles/puzzleService';

export type VisionMode = 'moves' | 'captures' | 'checks' | 'recall';

export type PieceRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

/** One question of a recall task: where did the piece that started on `origin` end up? */
export interface RecallQuestion {
  origin: Square;
  color: LongColor;
  role: PieceRole;
  /** Current square, or null when the piece was captured. */
  answer: Square | null;
  /** How many times the piece moved (0 = it was captured without moving). */
  moved: number;
}

export interface VisionTask {
  mode: VisionMode;
  fen: Fen;
  /** The piece whose moves are asked for (moves mode). */
  piece: Square | null;
  /** Squares (moves mode) or from+to keys (captures/checks) that must be found. */
  targets: Set<string>;
  turn: LongColor;
  dests: Map<Square, Square[]>;
  /** Recall mode: the moves (SAN) played from the initial position. */
  moves?: string[];
  /** Recall mode: the pieces to locate, in order. */
  questions?: RecallQuestion[];
}

const ROLES: Record<PieceSymbol, PieceRole> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

const FILES = 'abcdefgh';
const PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const BLOCKERS: PieceSymbol[] = ['p', 'p', 'p', 'n', 'b', 'r'];

function randomSquare(random: () => number): Square {
  return `${FILES[Math.floor(random() * 8)] ?? 'a'}${Math.floor(random() * 8) + 1}` as Square;
}

/**
 * A random position with kings, one white piece to ask about and a handful of
 * blockers, white to move and nobody in check.
 */
export function generateMovesTask(random: () => number = Math.random): VisionTask {
  for (let attempt = 0; attempt < 200; attempt++) {
    const chess = new Chess();
    chess.clear();
    const taken = new Set<Square>();
    const place = (type: PieceSymbol, color: 'w' | 'b'): Square | null => {
      for (let i = 0; i < 30; i++) {
        const square = randomSquare(random);
        if (taken.has(square)) continue;
        if (type === 'p' && (square[1] === '1' || square[1] === '8')) continue;
        if (chess.put({ type, color }, square)) {
          taken.add(square);
          return square;
        }
      }
      return null;
    };
    if (!place('k', 'w') || !place('k', 'b')) continue;
    const pieceType = PIECES[Math.floor(random() * PIECES.length)] ?? 'q';
    const piece = place(pieceType, 'w');
    if (!piece) continue;
    const blockerCount = 3 + Math.floor(random() * 5);
    for (let i = 0; i < blockerCount; i++) {
      const type = BLOCKERS[Math.floor(random() * BLOCKERS.length)] ?? 'p';
      place(type, random() < 0.5 ? 'w' : 'b');
    }
    let fen: Fen;
    try {
      fen = chess.fen();
      const check = new Chess(fen);
      if (check.isCheck()) continue;
      // Black must not be in check with White to move.
      const flipped = fen.replace(' w ', ' b ');
      if (new Chess(flipped).isCheck()) continue;
    } catch {
      continue;
    }
    const board = new Chess(fen);
    const targets = new Set(board.moves({ square: piece, verbose: true }).map((m) => m.to));
    if (targets.size < 2) continue;
    return { mode: 'moves', fen, piece, targets, turn: 'white', dests: legalDests(board) };
  }
  // Fallback: a knight in the centre.
  const fen = '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1';
  const board = new Chess(fen);
  return {
    mode: 'moves',
    fen,
    piece: 'd4',
    targets: new Set(board.moves({ square: 'd4', verbose: true }).map((m) => m.to)),
    turn: 'white',
    dests: legalDests(board),
  };
}

/**
 * Turns a puzzle position (after the opponent's setup move) into a "find all
 * captures / checks" task, or null when the count is not useful (0 or > 8).
 */
export function taskFromPuzzle(puzzle: Puzzle, mode: 'captures' | 'checks'): VisionTask | null {
  let chess: Chess;
  try {
    chess = new Chess(puzzle.fen);
    const setup = puzzle.moves.split(' ')[0];
    if (!setup) return null;
    chess.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] });
  } catch {
    return null;
  }
  const moves = chess.moves({ verbose: true });
  const wanted = moves.filter((m) =>
    mode === 'captures' ? !!m.captured : m.san.includes('+') || m.san.includes('#'),
  );
  const keys = new Set(wanted.map((m) => `${m.from}${m.to}`));
  if (keys.size === 0 || keys.size > 8) return null;
  return {
    mode,
    fen: chess.fen(),
    piece: null,
    targets: keys,
    turn: chess.turn() === 'w' ? 'white' : 'black',
    dests: legalDests(chess),
  };
}

const RECALL_MIN_PLIES = 6;
const RECALL_MAX_PLIES = 12;
const RECALL_QUESTIONS = 3;

/**
 * Follows every piece through a sequence of moves from the initial position:
 * where each one ends up and how often it moved. Castling moves the rook and
 * en passant removes the pawn that is not on the destination square.
 */
export function trackPieces(sans: string[]): {
  fen: Fen;
  pieces: RecallQuestion[];
} {
  const chess = new Chess();
  const where = new Map<Square, Square | null>();
  const moved = new Map<Square, number>();
  const origin = new Map<Square, Square>(); // current square -> starting square
  const start: RecallQuestion[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      where.set(cell.square, cell.square);
      moved.set(cell.square, 0);
      origin.set(cell.square, cell.square);
      start.push({
        origin: cell.square,
        color: cell.color === 'w' ? 'white' : 'black',
        role: ROLES[cell.type],
        answer: cell.square,
        moved: 0,
      });
    }
  }
  const relocate = (from: Square, to: Square) => {
    const id = origin.get(from);
    if (id === undefined) return;
    origin.delete(from);
    origin.set(to, id);
    where.set(id, to);
    moved.set(id, (moved.get(id) ?? 0) + 1);
  };
  const capture = (square: Square) => {
    const id = origin.get(square);
    if (id === undefined) return;
    origin.delete(square);
    where.set(id, null);
  };
  for (const san of sans) {
    const move = chess.move(san);
    if (move.isEnPassant()) {
      capture(`${move.to[0]}${move.from[1]}` as Square);
    } else if (move.isCapture()) {
      capture(move.to);
    }
    relocate(move.from, move.to);
    if (move.isKingsideCastle()) {
      const rank = move.color === 'w' ? '1' : '8';
      relocate(`h${rank}` as Square, `f${rank}` as Square);
    } else if (move.isQueensideCastle()) {
      const rank = move.color === 'w' ? '1' : '8';
      relocate(`a${rank}` as Square, `d${rank}` as Square);
    }
  }
  return {
    fen: chess.fen(),
    pieces: start.map((p) => ({
      ...p,
      answer: where.get(p.origin) ?? null,
      moved: moved.get(p.origin) ?? 0,
    })),
  };
}

/**
 * A "guess the position" task: a short opening sequence (SAN, from the initial
 * position) and a few pieces to locate afterwards. Pieces that moved more than
 * once or were captured are asked about first; the rest is a mix of pieces that
 * moved once, so the learner has to know which squares were left behind.
 */
export function generateRecallTask(
  lines: readonly string[],
  random: () => number = Math.random,
): VisionTask {
  const source = lines[Math.floor(random() * lines.length)] ?? 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6';
  const all = source.trim().split(/\s+/);
  const max = Math.min(RECALL_MAX_PLIES, all.length);
  const min = Math.min(RECALL_MIN_PLIES, max);
  const length = min + Math.floor(random() * (max - min + 1));
  const sans = all.slice(0, length);
  const { fen, pieces } = trackPieces(sans);
  const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const a = copy[i];
      const b = copy[j];
      if (a !== undefined && b !== undefined) {
        copy[i] = b;
        copy[j] = a;
      }
    }
    return copy;
  };
  const tricky = shuffle(pieces.filter((p) => p.answer === null || p.moved >= 2));
  const simple = shuffle(pieces.filter((p) => p.answer !== null && p.moved === 1));
  const questions = [...tricky, ...simple].slice(0, RECALL_QUESTIONS);
  const board = new Chess(fen);
  return {
    mode: 'recall',
    fen,
    piece: null,
    targets: new Set(questions.map((q) => q.answer ?? 'captured')),
    turn: board.turn() === 'w' ? 'white' : 'black',
    dests: new Map(),
    moves: sans,
    questions,
  };
}

/** "1. e4 e5 2. Nf3" from a list of SAN moves. */
export function numberedMoves(moves: string[]): string {
  return moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
}
