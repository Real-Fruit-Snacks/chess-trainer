import { Chess } from 'chess.js';
import type { Fen } from '@/chess/types';
import {
  type ArbiterRound,
  buildRound,
  type ReplayGame,
  type ReplayMove,
  replayGame,
} from '@/features/arcade/arbiter';
import { type IllegalKind, type IllegalMove, illegalMoves } from '@/features/arcade/arbiterMoves';
import { quietPositions } from '@/features/arcade/positions';
import { pickRound } from '@/features/arcade/whoStandsBetter';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { type Puzzle, PuzzleLoadError, selectRushPuzzle } from '@/features/puzzles/puzzleService';
import { duelContent } from '../../../relay/src/live/duelRules.mjs';
import { DUEL_RULES, LIMITS } from '../../../relay/src/live/shared.mjs';
import type { ArbiterItem, DuelItems, DuelKind, GameOptions, JudgeItem, RacePuzzle } from './types';

/**
 * A duel's rounds: made on the host's device (the poster's) before the duel
 * starts, and read back on both devices from what the relay passed on. Every
 * round is chess only — puzzle ids, positions, moves — so the relay can check
 * it (relay/src/live/duelRules.mjs) and nothing either device sends reaches
 * the other as text.
 */

/** A timed race's puzzles: more than anyone solves in three minutes. */
export const TIMED_RACE_PUZZLES = 40;
/** Each puzzle of a timed race is this much harder than the one before. */
const TIMED_STEP = 30;
/** A timed race starts this far below its level. */
const TIMED_START_BELOW = 400;
/** The puzzles of a race of rounds stay within this of its level. */
const ROUND_SPREAD = 100;
const PUZZLE_ID = /^[A-Za-z0-9]{3,12}$/;

const PREPARE_FAILED = 'The rounds could not be prepared.';

/** A race's puzzles: near its level for rounds, climbing from below it for a timed race. */
async function racePuzzles(opts: GameOptions, random: () => number): Promise<RacePuzzle[]> {
  const level = opts.level ?? 1500;
  const timed = opts.format === 'timed';
  const count = timed ? TIMED_RACE_PUZZLES : DUEL_RULES.race.rounds;
  const used = new Set<string>();
  const puzzles: RacePuzzle[] = [];
  for (let i = 0; i < count * 2 && puzzles.length < count; i++) {
    const n = puzzles.length;
    const target = timed
      ? Math.max(400, level - TIMED_START_BELOW + n * TIMED_STEP)
      : level + Math.round((random() * 2 - 1) * ROUND_SPREAD);
    const puzzle: Puzzle | null = await selectRushPuzzle(target, used, random);
    if (!puzzle) break;
    used.add(puzzle.id);
    const moves = puzzle.moves.split(' ');
    // Only what the relay takes: a Lichess id, and a line it can check.
    if (!PUZZLE_ID.test(puzzle.id) || moves.length < 2 || moves.length > 24) continue;
    puzzles.push({ id: puzzle.id, fen: puzzle.fen, moves: puzzle.moves, rating: puzzle.rating });
  }
  // The rounds go in one message: a timed race keeps as many puzzles as fit.
  const min = timed ? DUEL_RULES.race.timedMin : DUEL_RULES.race.rounds;
  while (
    puzzles.length > min &&
    JSON.stringify({ t: 'content', items: puzzles }).length > LIMITS.contentBytes
  ) {
    puzzles.pop();
  }
  return puzzles;
}

/** A move of a replay in UCI (with its promotion), played from `chess`'s position. */
function uciOf(chess: Chess, move: ReplayMove): string | null {
  try {
    const played = chess.move(move.san);
    return `${played.from}${played.to}${played.promotion ?? ''}`;
  } catch {
    return null;
  }
}

let replays: ReplayGame[] | null = null;

/** The classic games, read move by move (once). */
export function classicReplays(): ReplayGame[] {
  replays ??= CLASSIC_GAMES.map(replayGame);
  return replays;
}

/** Arbiter's rounds: subtler illegal moves round by round, as in the arcade. */
function arbiterItems(random: () => number): ArbiterItem[] {
  const games = classicReplays();
  const recent: IllegalKind[] = [];
  const items: ArbiterItem[] = [];
  for (
    let n = 1;
    items.length < DUEL_RULES.arbiter.rounds && n <= 3 * DUEL_RULES.arbiter.rounds;
    n++
  ) {
    const round = buildRound(games, items.length + 1, random, recent);
    if (!round) break;
    const chess = new Chess(round.startFen);
    const lead = round.lead.map((move) => uciOf(chess, move));
    if (lead.length === 0 || lead.some((uci) => uci === null)) continue;
    recent.unshift(round.illegal.kind);
    recent.splice(4);
    items.push({
      fen: round.startFen,
      ply: round.startPly,
      lead: lead as string[],
      illegal: { from: round.illegal.from, to: round.illegal.to, kind: round.illegal.kind },
      game: round.gameId,
    });
  }
  return items;
}

/** Who Stands Better?'s positions: quiet ones, at most two from a game. */
function judgeItems(random: () => number): JudgeItem[] {
  return pickRound(quietPositions(), random, DUEL_RULES.judge.rounds).map((position) => ({
    fen: position.fen,
    cp: position.cp,
    game: position.gameId,
    ply: position.ply,
  }));
}

/**
 * Makes a duel's rounds on the host's device, checked as the relay will check
 * them. Throws (with a sentence to show) when they cannot be made: the
 * puzzles out of reach offline, say.
 */
export async function prepareDuel(
  game: DuelKind,
  opts: GameOptions,
  random: () => number = Math.random,
): Promise<DuelItems> {
  let items: unknown[];
  try {
    if (game === 'race') items = await racePuzzles(opts, random);
    else if (game === 'arbiter') items = arbiterItems(random);
    else items = judgeItems(random);
  } catch (err) {
    throw err instanceof PuzzleLoadError ? err : new Error(PREPARE_FAILED);
  }
  const checked = duelContent(game, opts, items);
  if (!checked) {
    throw new Error(
      game === 'race'
        ? 'Not enough puzzles could be loaded. Check your connection, or download the puzzles in Settings.'
        : PREPARE_FAILED,
    );
  }
  return checked;
}

/* ------------------------------------------------------------------ */
/* Reading the rounds back                                            */
/* ------------------------------------------------------------------ */

/** The same position, whatever the move counters say. */
const samePlace = (a: string, b: string) =>
  a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ');

/** The real moves of a round, replayed from its position: null when one does not fit. */
function leadMoves(fen: Fen, lead: readonly string[]): ReplayMove[] | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  const moves: ReplayMove[] = [];
  for (const uci of lead) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
      moves.push({
        from: move.from,
        to: move.to,
        san: move.san,
        piece: move.piece,
        color: move.color,
        fen: move.after,
      });
    } catch {
      return null;
    }
  }
  return moves;
}

/**
 * An Arbiter round as both devices show it, from what the host sent: the
 * real moves, then the illegal one with the position it leaves and why it is
 * not allowed. The moves before the round come from the classic game itself,
 * when this device has it as the host had it (some illegal moves depend on
 * them: a late en passant, a side moving twice); otherwise from the round's
 * own moves. Null when the round cannot be read.
 */
export function arbiterRoundOf(
  item: ArbiterItem,
  games: readonly ReplayGame[] = classicReplays(),
): ArbiterRound | null {
  const lead = leadMoves(item.fen, item.lead);
  if (!lead) return null;
  const kind = item.illegal.kind as IllegalKind;
  const before = lead[lead.length - 1]?.fen ?? item.fen;
  const game = games.find((g) => g.id === item.game);
  const fromGame =
    game &&
    samePlace(game.positions[item.ply] ?? '', item.fen) &&
    lead.every((move, i) => game.moves[item.ply + i]?.san === move.san);
  const history = fromGame && game ? game.moves.slice(0, item.ply + lead.length) : lead;
  const matches = (move: IllegalMove) =>
    move.from === item.illegal.from && move.to === item.illegal.to;
  const illegal = illegalMoves({ fen: before, history }, kind).find(matches);
  if (!illegal) return null;
  return {
    gameId: item.game,
    title: game?.title ?? '',
    caption: game?.caption ?? '',
    startPly: item.ply,
    startFen: item.fen,
    lead,
    illegal,
  };
}

/** The rounds a duel's host sent, as this device reads them. */
export function raceItems(items: DuelItems | null): RacePuzzle[] {
  return (items ?? []) as RacePuzzle[];
}

export function judgeRoundItems(items: DuelItems | null): JudgeItem[] {
  return (items ?? []) as JudgeItem[];
}

export function arbiterRoundItems(items: DuelItems | null): ArbiterItem[] {
  return (items ?? []) as ArbiterItem[];
}

/** A race's puzzle as the puzzle trainer takes it. */
export function trainerPuzzle(puzzle: RacePuzzle): Puzzle {
  return {
    id: puzzle.id,
    fen: puzzle.fen,
    moves: puzzle.moves,
    rating: puzzle.rating,
    rd: 0,
    popularity: 0,
    plays: 0,
    themes: '',
    url: '',
  };
}
