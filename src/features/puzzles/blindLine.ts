import { Chess, type Square } from 'chess.js';
import { moveLabel, parseUci, toUci, tryMove, turnOf } from '@/chess/helpers';
import type { Fen, LongColor, MoveInput, San, Uci } from '@/chess/types';

/**
 * A blind puzzle's line: the start after the opponent's move, the moves played
 * since with their numbers, the hidden position, and the verdict on the next
 * move.
 */

/** A bundled puzzle made ready for blind solving. */
export interface BlindSetup {
  /** The position the board shows throughout: the puzzle after the opponent's move. */
  startFen: Fen;
  /** The opponent's move that sets the puzzle up (shown on the board). */
  setup: { uci: Uci; san: San; from: Square; to: Square; label: string };
  solverColor: LongColor;
  /** The moves after the setup move: the solver's first, then the replies in turn. */
  solution: Uci[];
}

/** One move of the line after the setup move. */
export interface BlindMove {
  uci: Uci;
  san: San;
  by: 'you' | 'opponent';
  /** "24." before a White move, "24..." before a Black move that starts the line; else null. */
  label: string | null;
}

/** The puzzle's start, or null when its moves do not replay (a broken entry). */
export function prepareBlind(puzzle: { fen: Fen; moves: string }): BlindSetup | null {
  const [first, ...solution] = puzzle.moves.trim().split(/\s+/);
  if (!first || solution.length === 0) return null;
  let chess: Chess;
  try {
    chess = new Chess(puzzle.fen);
  } catch {
    return null;
  }
  const move = tryMove(chess, parseUci(first));
  if (!move) return null;
  const startFen = chess.fen();
  if (!replays(startFen, solution)) return null;
  return {
    startFen,
    setup: {
      uci: first,
      san: move.san,
      from: move.from,
      to: move.to,
      label: moveLabel(0, puzzle.fen),
    },
    solverColor: turnOf(startFen),
    solution,
  };
}

function replays(fen: Fen, moves: Uci[]): boolean {
  const chess = new Chess(fen);
  return moves.every((uci) => tryMove(chess, parseUci(uci)) !== null);
}

/** The line as moves with their numbers, replayed from the start position. */
export function blindLine(setup: BlindSetup, played: readonly Uci[]): BlindMove[] {
  const chess = new Chess(setup.startFen);
  const out: BlindMove[] = [];
  for (const [i, uci] of played.entries()) {
    const move = tryMove(chess, parseUci(uci));
    if (!move) break;
    const label = moveLabel(i, setup.startFen);
    out.push({
      uci,
      san: move.san,
      by: i % 2 === 0 ? 'you' : 'opponent',
      // Every White move is numbered; a Black move only when it opens the line.
      label: i === 0 || !label.endsWith('...') ? label : null,
    });
  }
  return out;
}

/** The position after the moves played so far (the one the learner has to see). */
export function blindFen(setup: BlindSetup, played: readonly Uci[]): Fen {
  const chess = new Chess(setup.startFen);
  for (const uci of played) {
    if (!tryMove(chess, parseUci(uci))) break;
  }
  return chess.fen();
}

export type BlindVerdict =
  | { kind: 'illegal' }
  | { kind: 'wrong'; uci: Uci; san: San }
  | { kind: 'correct'; uci: Uci; san: San; done: boolean };

/**
 * Judges the learner's next move: the stored one is right, and so is any
 * mate — a quicker or different mate solves the puzzle too. A move that is not
 * legal in the current position is neither: the learner lost track of a
 * piece, which is worth telling apart from a wrong idea.
 */
export function judgeBlindMove(
  setup: BlindSetup,
  played: readonly Uci[],
  move: MoveInput,
): BlindVerdict {
  const chess = new Chess(blindFen(setup, played));
  const made = tryMove(chess, move);
  if (!made) return { kind: 'illegal' };
  const uci = toUci(made);
  if (chess.isCheckmate()) return { kind: 'correct', uci, san: made.san, done: true };
  if (uci === setup.solution[played.length]) {
    return {
      kind: 'correct',
      uci,
      san: made.san,
      done: played.length + 1 >= setup.solution.length,
    };
  }
  return { kind: 'wrong', uci, san: made.san };
}
