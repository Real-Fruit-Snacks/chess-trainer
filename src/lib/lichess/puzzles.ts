import { Chess } from 'chess.js';
import { parseUci, toUci, tryMove } from '@/chess/helpers';
import type { Puzzle } from '@/features/puzzles/puzzleService';
import { DEFAULT_PUZZLE_RD } from '@/lib/rating';
import type { PendingPuzzleResult } from '@/store/lichess';
import { isLichessPuzzleId } from '@/store/lichess';
import type { LichessPerf } from './auth';
import { LichessError, lichessJson, lichessNdjson } from './api';

/**
 * Puzzles both ways. Results go up in batches through the endpoint Lichess
 * documents for "solve multiple puzzles at once" — it records each round and
 * updates the puzzle rating, rated or not as sent. The history comes down as
 * the account's puzzle activity, newest first. Missed puzzles are fetched one
 * by one and turned into the app's own format, so they can be reviewed here —
 * offline too.
 */

/** Lichess takes fewer than 100 solutions per request; batches stay well under. */
export const SOLVE_BATCH = 50;
/** The first read of a history stops after this many rounds (Lichess streams 20 a second). */
export const FIRST_ACTIVITY_MAX = 500;
/** Later reads, from where the last one stopped. */
export const ACTIVITY_MAX = 2000;
/** Missed puzzles fetched for the review queue in one sync, newest first. */
export const MISSED_FETCH_MAX = 30;

/** A round from the Lichess puzzle history. */
export interface LichessRound {
  id: string;
  win: boolean;
  /** When Lichess recorded it (ms). */
  date: number;
  rating: number;
  /** Space-separated theme keys, as the app stores them. */
  themes: string;
}

/** `/api/puzzle/{id}`: the puzzle and the game it comes from. */
export interface LichessPuzzleJson {
  game: { id: string; pgn: string };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[];
    themes: string[];
    initialPly: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** One line of the activity stream, or null when it is not a puzzle round. */
export function roundFrom(item: unknown): LichessRound | null {
  if (!isRecord(item) || typeof item.date !== 'number' || typeof item.win !== 'boolean') {
    return null;
  }
  const puzzle = item.puzzle;
  if (!isRecord(puzzle) || typeof puzzle.id !== 'string' || !isLichessPuzzleId(puzzle.id)) {
    return null;
  }
  const themes = Array.isArray(puzzle.themes)
    ? puzzle.themes.filter((t): t is string => typeof t === 'string')
    : [];
  return {
    id: puzzle.id,
    win: item.win,
    date: item.date,
    rating: typeof puzzle.rating === 'number' ? puzzle.rating : 0,
    themes: themes.join(' '),
  };
}

/**
 * The app's form of a Lichess puzzle: the position *before* the opponent's
 * move that sets it up, then that move and the solution. Lichess gives the
 * game's moves up to and including that move (`initialPly` is its index), so
 * the position comes from replaying them. Null when anything does not add up
 * (an illegal move, a solution that does not play).
 */
export function puzzleFromLichess(json: unknown): Puzzle | null {
  if (!isRecord(json) || !isRecord(json.game) || !isRecord(json.puzzle)) return null;
  const { game, puzzle } = json as unknown as LichessPuzzleJson;
  if (
    typeof game.pgn !== 'string' ||
    typeof game.id !== 'string' ||
    typeof puzzle.id !== 'string' ||
    !isLichessPuzzleId(puzzle.id) ||
    typeof puzzle.initialPly !== 'number' ||
    !Array.isArray(puzzle.solution) ||
    puzzle.solution.length === 0
  ) {
    return null;
  }
  const sans = game.pgn.trim().split(/\s+/);
  if (puzzle.initialPly < 0 || puzzle.initialPly >= sans.length) return null;
  const chess = new Chess();
  for (let i = 0; i < puzzle.initialPly; i++) {
    if (!tryMove(chess, sans[i] ?? '')) return null;
  }
  const before = chess.fen();
  const setUp = tryMove(chess, sans[puzzle.initialPly] ?? '');
  if (!setUp) return null;
  const moves = [toUci(setUp)];
  for (const uci of puzzle.solution) {
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    const move = tryMove(chess, parseUci(uci));
    if (!move) return null;
    moves.push(toUci(move));
  }
  // Sorted, as the app's own puzzle files list them.
  const themes = Array.isArray(puzzle.themes)
    ? puzzle.themes.filter((t): t is string => typeof t === 'string').sort()
    : [];
  // The game at the move before the puzzle, from the side that makes it (as Lichess links it).
  const side = before.split(' ')[1] === 'b' ? '/black' : '';
  return {
    id: puzzle.id,
    fen: before,
    moves: moves.join(' '),
    rating: typeof puzzle.rating === 'number' ? puzzle.rating : 1500,
    rd: DEFAULT_PUZZLE_RD,
    popularity: 0,
    plays: typeof puzzle.plays === 'number' ? puzzle.plays : 0,
    themes: themes.join(' '),
    url: `https://lichess.org/${game.id}${side}#${puzzle.initialPly + 1}`,
  };
}

/** Fetches one puzzle in the app's form; null when Lichess no longer has it. */
export async function fetchLichessPuzzle(id: string): Promise<Puzzle | null> {
  try {
    return puzzleFromLichess(await lichessJson(`/api/puzzle/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof LichessError && err.kind === 'not-found') return null;
    throw err;
  }
}

export interface SolveAnswer {
  /** The rounds Lichess recorded (unknown puzzles are left out). */
  rounds: { id: string; win: boolean; ratingDiff: number }[];
  /** The account's puzzle rating after them. */
  perf: LichessPerf | null;
}

/** Sends up to `SOLVE_BATCH` results. */
export async function sendPuzzleResults(
  token: string,
  results: readonly PendingPuzzleResult[],
): Promise<SolveAnswer> {
  const answer = await lichessJson<{
    rounds?: unknown;
    glicko?: { rating?: unknown; deviation?: unknown; provisional?: unknown };
  }>('/api/puzzle/batch/mix', {
    token,
    json: { solutions: results.map(({ id, win, rated }) => ({ id, win, rated })) },
  });
  const rounds = Array.isArray(answer?.rounds)
    ? answer.rounds.flatMap((r: unknown) =>
        isRecord(r) && typeof r.id === 'string'
          ? [
              {
                id: r.id,
                win: r.win === true,
                ratingDiff: typeof r.ratingDiff === 'number' ? r.ratingDiff : 0,
              },
            ]
          : [],
      )
    : [];
  const glicko = answer?.glicko;
  const perf =
    glicko && typeof glicko.rating === 'number' && Number.isFinite(glicko.rating)
      ? {
          rating: Math.round(glicko.rating),
          rd:
            typeof glicko.deviation === 'number' && Number.isFinite(glicko.deviation)
              ? Math.round(glicko.deviation)
              : 350,
          games: 0,
          prov: glicko.provisional === true,
        }
      : null;
  return { rounds, perf };
}

/**
 * Reads the puzzle history from `since` (inclusive; the whole history when
 * null), newest first, at most `max` rounds.
 */
export async function readPuzzleActivity(
  token: string,
  since: number | null,
  max: number,
  onRound: (round: LichessRound) => void,
): Promise<number> {
  return lichessNdjson(
    '/api/puzzle/activity',
    (item) => {
      const round = roundFrom(item);
      if (round) onRound(round);
    },
    { token, query: { max, ...(since !== null ? { since } : {}) } },
  );
}
