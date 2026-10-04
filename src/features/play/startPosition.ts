import { Chess } from 'chess.js';
import { gameStatus, sanitizeFen } from '@/chess/helpers';
import type { Fen } from '@/chess/types';
import { validatePosition } from '@/features/analyze/boardEditorModel';

/**
 * A hand-off FEN the engine can actually play: well formed, the side not to
 * move is not in check, and the game is not already over. Returns the reason
 * when it is refused.
 */
export function checkStartPosition(raw: string | null): {
  fen: Fen | null;
  problem: string | null;
} {
  if (!raw) return { fen: null, problem: null };
  const fen = sanitizeFen(raw);
  if (!fen) return { fen: null, problem: 'That position is not a valid FEN.' };
  const invalid = validatePosition(fen);
  if (invalid) return { fen: null, problem: invalid };
  const status = gameStatus(new Chess(fen));
  if (status.over) {
    return { fen: null, problem: `That game is already over (${status.reason ?? 'game over'}).` };
  }
  return { fen, problem: null };
}
