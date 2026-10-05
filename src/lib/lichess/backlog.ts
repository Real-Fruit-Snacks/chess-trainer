import type { LichessState, PendingGame, PendingPuzzleResult } from '@/store/lichess';
import { isLichessPuzzleId } from '@/store/lichess';
import type { ProgressState } from '@/store/progress';
import { syncsGame } from './records';

/**
 * What this device recorded without it going to Lichess — before the account
 * was connected, while it was not, or while that part of the sync was off:
 * Lichess puzzles attempted here and games played here. Offered after
 * connecting (and after switching a part back on), so the Lichess history
 * can be complete; nothing goes without the learner saying so.
 */
export interface Backlog {
  puzzles: PendingPuzzleResult[];
  games: PendingGame[];
}

export function lichessBacklog(
  progress: Pick<ProgressState, 'attempts' | 'games'>,
  lichess: Pick<LichessState, 'sent' | 'outbox'>,
): Backlog {
  const queued = new Set(lichess.outbox.puzzles.map((p) => `${p.id}@${p.at}`));
  // The logs are newest first: reversed, ties keep the order they happened in.
  const puzzles = [...progress.attempts]
    .reverse()
    .filter(
      (a) =>
        isLichessPuzzleId(a.id) &&
        !queued.has(`${a.id}@${a.at}`) &&
        // Sent from here after this attempt: Lichess has it.
        !((lichess.sent[a.id] ?? 0) >= a.at),
    )
    .map((a) => ({
      id: a.id,
      // A clean solve is a win on Lichess; a hint makes it a loss there.
      win: a.outcome === 'solved' && !a.hintUsed && (a.hintLevel ?? 0) === 0,
      // Attempts that moved the rating here were rated ones.
      rated: a.ratingAfter !== a.ratingBefore,
      at: a.at,
    }))
    .sort((a, b) => a.at - b.at);
  const waiting = new Set(lichess.outbox.games.map((g) => g.record.id));
  const games = [...progress.games]
    .reverse()
    .filter((g) => !g.lichessId && syncsGame(g) && !waiting.has(g.id))
    .map((g) => ({ record: g, at: g.at }))
    .sort((a, b) => a.at - b.at);
  return { puzzles, games };
}
