import type { Fen, LongColor } from '@/chess/types';
import { turnOf } from '@/chess/helpers';
import { CLASSIC_GAMES } from '@/features/classics/games';
import raw from './positions.json';

/**
 * Middlegame positions from the classic games, evaluated by the engine
 * (scripts/build-arcade-positions.mjs). `cp` is from White's point of view.
 */
export interface EvalPosition {
  id: string;
  gameId: string;
  ply: number;
  fen: Fen;
  cp: number;
  /** Moves to mate when the engine saw one (sign as the engine reports it, for the side to move). */
  mate?: number;
  /** The engine's best move, UCI. */
  best: string;
  /** The best move is a capture or a check: something concrete is going on. */
  forcing: boolean;
  pieces: number;
}

export const POSITIONS: readonly EvalPosition[] = raw;

/** Who played the game a position comes from. */
export function describeGame(position: Pick<EvalPosition, 'gameId'>): string {
  const game = CLASSIC_GAMES.find((g) => g.id === position.gameId);
  return game ? `${game.white} – ${game.black}, ${game.year}` : position.gameId;
}

/** Evaluation from the side to move's point of view. */
export function moverCp(position: Pick<EvalPosition, 'fen' | 'cp'>): number {
  return turnOf(position.fen) === 'white' ? position.cp : -position.cp;
}

export function sideToMove(position: Pick<EvalPosition, 'fen'>): LongColor {
  return turnOf(position.fen);
}

/** Positions where nothing is hanging and the evaluation is within a few pawns: judgement calls. */
export function quietPositions(all: readonly EvalPosition[] = POSITIONS): EvalPosition[] {
  return all.filter(
    (p) => !p.forcing && p.mate === undefined && Math.abs(p.cp) <= 500 && p.pieces >= 14,
  );
}

export type FortressTier = 1 | 2 | 3;

/** Clearly worse for the side to move, but not lost: something to defend. */
export function fortressTier(position: EvalPosition): FortressTier | null {
  if (position.mate !== undefined || position.pieces < 12) return null;
  const cp = moverCp(position);
  if (cp > -150 || cp < -450) return null;
  if (cp > -230) return 1;
  if (cp > -330) return 2;
  return 3;
}

export function fortressPositions(all: readonly EvalPosition[] = POSITIONS): EvalPosition[] {
  return all.filter((p) => fortressTier(p) !== null);
}
