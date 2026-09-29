import type { Chess, Move } from 'chess.js';
import type { LessonTask } from './model';

/** Strips check/mate suffixes and normalises castling so answers compare reliably. */
export function normalizeSan(san: string): string {
  return san
    .replace(/[+#]+$/, '')
    .replace(/0-0-0/g, 'O-O-O')
    .replace(/0-0/g, 'O-O')
    .replace(/=?([QRBN])$/, '=$1')
    .trim();
}

export type TaskVerdict = 'correct' | 'wrong';

/**
 * Judges a move the learner played against the task definition.
 * `after` is the position after the move has been made.
 */
export function judgeTaskMove(task: LessonTask, played: Move, after: Chess): TaskVerdict {
  const normalized = normalizeSan(played.san);
  if (task.moves.some((m) => normalizeSan(m) === normalized)) return 'correct';
  if (task.acceptAnyMate && after.isCheckmate()) return 'correct';
  return 'wrong';
}
