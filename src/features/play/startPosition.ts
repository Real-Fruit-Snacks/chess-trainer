import { Chess } from 'chess.js';
import { chess960Position, isChess960Fen, normalizeChess960Fen } from '@/chess/chess960';
import { gameStatus, sanitizeFen } from '@/chess/helpers';
import type { Fen } from '@/chess/types';
import { validatePosition } from '@/features/analyze/boardEditorModel';

/**
 * A hand-off FEN the engine can actually play: well formed, the side not to
 * move is not in check, and the game is not already over. Returns the reason
 * when it is refused. A Chess960 position (asked for, or one only Chess960
 * has: castling rights by file, a start other than the classical one) keeps
 * its castling rights and says so.
 */
export function checkStartPosition(
  raw: string | null,
  options: { chess960?: boolean } = {},
): {
  fen: Fen | null;
  problem: string | null;
  /** The position is to be played as Chess960. */
  chess960: boolean;
} {
  if (!raw) return { fen: null, problem: null, chess960: false };
  const chess960 = options.chess960 === true || isChess960Fen(raw);
  // Read as standard chess first, whose checks say what is wrong in words (castling aside, the
  // rules agree).
  const fen = sanitizeFen(raw);
  if (!fen) return { fen: null, problem: 'That position is not a valid FEN.', chess960 };
  const invalid = validatePosition(fen);
  if (invalid) return { fen: null, problem: invalid, chess960 };
  if (chess960) {
    const own = normalizeChess960Fen(raw);
    const status = own ? chess960Position(own)?.status : null;
    if (!own || !status) {
      return { fen: null, problem: 'That position is not a valid FEN.', chess960 };
    }
    if (status.over) {
      return {
        fen: null,
        problem: `That game is already over (${status.reason ?? 'game over'}).`,
        chess960,
      };
    }
    return { fen: own, problem: null, chess960 };
  }
  const status = gameStatus(new Chess(fen));
  if (status.over) {
    return {
      fen: null,
      problem: `That game is already over (${status.reason ?? 'game over'}).`,
      chess960,
    };
  }
  return { fen, problem: null, chess960 };
}
