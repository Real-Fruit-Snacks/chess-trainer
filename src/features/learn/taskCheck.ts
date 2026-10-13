import type { Chess, Move } from 'chess.js';
import type { LessonTask, WrongMove } from './model';

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

/** The coach's answer to a wrong move the task lists (`task.wrong`), if it is one of them. */
export function wrongMoveAnswer(task: LessonTask, san: string): WrongMove | null {
  const played = normalizeSan(san);
  for (const [key, answer] of Object.entries(task.wrong ?? {})) {
    if (normalizeSan(key) === played) return typeof answer === 'string' ? { text: answer } : answer;
  }
  return null;
}
