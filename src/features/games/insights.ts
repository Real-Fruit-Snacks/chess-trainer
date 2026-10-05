import { Chess } from 'chess.js';
import type { Fen, LongColor } from '@/chess/types';
import { explainReviewedMove, type Motif, MOTIF_HELP } from '@/features/analyze/commentary';
import type { ReviewSummary } from '@/features/analyze/gameReview';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { themeName } from '@/features/puzzles/themes';
import type { GameRecord } from '@/store/progress';
import type { StoredGame } from '@/store/games';
import { learnerColor, outcomeFor } from './gameStats';

/**
 * Insights: what your reviewed games say about you. Each review is boiled
 * down to a small digest when it is made (phases, mistake types, opening);
 * the aggregation over all games happens on demand.
 */
export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

export interface PhaseDigest {
  moves: number;
  /** Sum of win-probability losses over those moves. */
  loss: number;
  /** Mistakes and blunders. */
  errors: number;
}

export interface ReviewDigest {
  phases: Record<Phase, Record<LongColor, PhaseDigest>>;
  motifs: Record<LongColor, Partial<Record<Motif, number>>>;
}

const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 0, k: 0 };

/** Opening for the first ten moves, endgame once the board has thinned out. */
export function phaseOf(fen: Fen, ply: number): Phase {
  const chess = new Chess(fen);
  let material = 0;
  let queens = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      material += PIECE_VALUE[piece.type] ?? 0;
      if (piece.type === 'q') queens++;
    }
  }
  if (material <= 18 || (queens === 0 && material <= 26)) return 'endgame';
  return ply <= 20 ? 'opening' : 'middlegame';
}

function emptyPhases(): Record<Phase, Record<LongColor, PhaseDigest>> {
  const blank = () => ({ moves: 0, loss: 0, errors: 0 });
  return {
    opening: { white: blank(), black: blank() },
    middlegame: { white: blank(), black: blank() },
    endgame: { white: blank(), black: blank() },
  };
}

/** Summarises a review for storage: where the errors happened and what kind they were. */
export function digestReview(summary: ReviewSummary): ReviewDigest {
  const digest: ReviewDigest = { phases: emptyPhases(), motifs: { white: {}, black: {} } };
  for (const move of summary.moves) {
    const phase = phaseOf(move.fen, move.ply);
    const bucket = digest.phases[phase][move.mover];
    bucket.moves += 1;
    bucket.loss += move.loss;
    if (move.judgement === 'mistake' || move.judgement === 'blunder') bucket.errors += 1;
    if (
      move.judgement === 'mistake' ||
      move.judgement === 'blunder' ||
      move.judgement === 'inaccuracy'
    ) {
      const explanation = explainReviewedMove(move);
      const motif: Motif = explanation?.motif ?? 'generic';
      const side = digest.motifs[move.mover];
      side[motif] = (side[motif] ?? 0) + 1;
    }
  }
  return digest;
}

/** 0–100 from an average win-probability loss (the same curve as game review). */
export function accuracyFromLoss(loss: number, moves: number): number | null {
  if (moves === 0) return null;
  return Math.round(100 * Math.exp(-5 * (loss / moves)));
}

/** Below these the numbers are shown greyed out: too little to draw conclusions from. */
export const MIN_MOVES_FOR_INSIGHT = 20;
export const MIN_GAMES_FOR_INSIGHT = 3;
/** A mistake seen fewer times than this is not yet a pattern. */
export const MIN_MOTIF_COUNT = 3;

export interface PhaseInsight {
  phase: Phase;
  moves: number;
  accuracy: number | null;
  errors: number;
  /** Errors per 10 moves, for comparing phases of different length. */
  errorRate: number | null;
  /** Enough moves to mean something (`MIN_MOVES_FOR_INSIGHT`). */
  reliable: boolean;
}

export interface MotifInsight {
  motif: Motif;
  count: number;
  lessonId: string;
  lessonTitle: string;
  theme: string | null;
  themeName: string | null;
  /** Seen often enough to be a pattern (`MIN_MOTIF_COUNT`). */
  reliable: boolean;
}

export interface ColourInsight {
  color: LongColor;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  accuracy: number | null;
  /** Reviewed moves behind the accuracy figure. */
  moves: number;
  reliable: boolean;
}

export interface OpeningInsight {
  name: string;
  games: number;
  score: number;
  accuracy: number | null;
  /** Reviewed moves behind the accuracy figure. */
  moves: number;
  reliable: boolean;
}

/** Results against one engine level. */
export interface LevelInsight {
  level: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

/** Results against the human-like opponent at one rating. */
export interface RatingInsight {
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface WorkItem {
  id: string;
  title: string;
  detail: string;
  lessonId: string | null;
  theme: string | null;
}

export interface Insights {
  reviewedGames: number;
  phases: PhaseInsight[];
  motifs: MotifInsight[];
  colours: ColourInsight[];
  openings: OpeningInsight[];
  levels: LevelInsight[];
  /** The human-like opponent's games, by its rating. */
  ratings: RatingInsight[];
  /** Games where the book was followed vs left early. */
  book: { games: number; deviated: number; averageBookMoves: number | null };
  workOn: WorkItem[];
}

const MOTIF_LABEL: Record<Motif, string> = {
  'missed-mate': 'Missed mates',
  'allows-mate': 'Allowed mates',
  'hanging-piece': 'Hanging pieces',
  'loses-exchange': 'Losing exchanges',
  fork: 'Forks you walked into',
  pin: 'Pins you walked into',
  skewer: 'Skewers you walked into',
  'discovered-attack': 'Discovered attacks you allowed',
  'missed-material': 'Missed wins of material',
  'missed-fork': 'Missed forks',
  'missed-mate-threat': 'Missed mating attacks',
  'queen-trade': 'Unwanted queen trades',
  passive: 'Passive moves',
  generic: 'Other mistakes',
};

export function motifLabel(motif: Motif): string {
  return MOTIF_LABEL[motif];
}

/** Which openings a game belongs to (family name), from the stored review digest. */
export interface GameOpeningName {
  gameId: string;
  opening: string | null;
}

export function buildInsights(
  games: StoredGame[],
  player: string,
  engineGames: GameRecord[],
  openingsByGame: Record<string, string | null> = {},
): Insights {
  const phases = emptyPhases();
  const motifs: Partial<Record<Motif, number>> = {};
  const colours: Record<LongColor, ColourInsight> = {
    white: {
      color: 'white',
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      accuracy: null,
      moves: 0,
      reliable: false,
    },
    black: {
      color: 'black',
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      accuracy: null,
      moves: 0,
      reliable: false,
    },
  };
  const colourLoss: Record<LongColor, { loss: number; moves: number }> = {
    white: { loss: 0, moves: 0 },
    black: { loss: 0, moves: 0 },
  };
  const openings = new Map<
    string,
    { games: number; points: number; decided: number; loss: number; moves: number }
  >();
  let reviewedGames = 0;

  for (const game of games) {
    const color = learnerColor(game, player);
    if (!color) continue;
    colours[color].games += 1;
    const outcome = outcomeFor(game.result, color);
    if (outcome === 'win') colours[color].wins += 1;
    else if (outcome === 'draw') colours[color].draws += 1;
    else if (outcome === 'loss') colours[color].losses += 1;

    const opening = openingsByGame[game.id] ?? null;
    if (opening) {
      const row = openings.get(opening) ?? { games: 0, points: 0, decided: 0, loss: 0, moves: 0 };
      row.games += 1;
      if (outcome) {
        row.decided += 1;
        row.points += outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      }
      openings.set(opening, row);
    }

    const digest = game.review?.digest;
    if (!digest) continue;
    reviewedGames += 1;
    for (const phase of PHASES) {
      const bucket = digest.phases[phase][color];
      phases[phase][color].moves += bucket.moves;
      phases[phase][color].loss += bucket.loss;
      phases[phase][color].errors += bucket.errors;
      colourLoss[color].loss += bucket.loss;
      colourLoss[color].moves += bucket.moves;
      if (opening) {
        const row = openings.get(opening);
        if (row) {
          row.loss += bucket.loss;
          row.moves += bucket.moves;
        }
      }
    }
    for (const [motif, count] of Object.entries(digest.motifs[color])) {
      const key = motif as Motif;
      motifs[key] = (motifs[key] ?? 0) + (count ?? 0);
    }
  }

  const phaseInsights: PhaseInsight[] = PHASES.map((phase) => {
    const moves = phases[phase].white.moves + phases[phase].black.moves;
    const loss = phases[phase].white.loss + phases[phase].black.loss;
    const errors = phases[phase].white.errors + phases[phase].black.errors;
    return {
      phase,
      moves,
      accuracy: accuracyFromLoss(loss, moves),
      errors,
      errorRate: moves ? Math.round((errors / moves) * 100) / 10 : null,
      reliable: moves >= MIN_MOVES_FOR_INSIGHT,
    };
  });

  const motifInsights: MotifInsight[] = (Object.entries(motifs) as [Motif, number][])
    .filter(([motif]) => motif !== 'generic')
    .sort((a, b) => b[1] - a[1])
    .map(([motif, count]) => {
      const help = MOTIF_HELP[motif];
      return {
        motif,
        count,
        lessonId: help.lesson,
        lessonTitle: getLessonMeta(help.lesson)?.title ?? help.lesson,
        theme: help.theme,
        themeName: help.theme ? themeName(help.theme) : null,
        reliable: count >= MIN_MOTIF_COUNT,
      };
    });

  for (const color of ['white', 'black'] as const) {
    colours[color].accuracy = accuracyFromLoss(colourLoss[color].loss, colourLoss[color].moves);
    colours[color].moves = colourLoss[color].moves;
    colours[color].reliable =
      colours[color].games >= MIN_GAMES_FOR_INSIGHT &&
      colourLoss[color].moves >= MIN_MOVES_FOR_INSIGHT;
  }

  const openingInsights: OpeningInsight[] = [...openings.entries()]
    .map(([name, row]) => ({
      name,
      games: row.games,
      score: row.decided ? Math.round((row.points / row.decided) * 100) : 0,
      accuracy: accuracyFromLoss(row.loss, row.moves),
      moves: row.moves,
      reliable: row.games >= MIN_GAMES_FOR_INSIGHT && row.moves >= MIN_MOVES_FOR_INSIGHT,
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, 8);

  const levels = new Map<number, LevelInsight>();
  const ratings = new Map<number, RatingInsight>();
  let bookGames = 0;
  let bookDeviated = 0;
  let bookMoves = 0;
  for (const game of engineGames) {
    // The human-like opponent has a rating, not an engine level: its games get rows of their own.
    const humanlike = game.source === 'humanlike';
    if (!humanlike || game.opponentRating !== undefined) {
      const key = humanlike ? (game.opponentRating ?? 0) : game.level;
      const rows: Map<number, { games: number; wins: number; draws: number; losses: number }> =
        humanlike ? ratings : levels;
      const row =
        rows.get(key) ??
        (humanlike
          ? { rating: key, games: 0, wins: 0, draws: 0, losses: 0 }
          : { level: key, games: 0, wins: 0, draws: 0, losses: 0 });
      row.games += 1;
      const outcome = outcomeFor(game.result, game.color);
      if (outcome === 'win') row.wins += 1;
      else if (outcome === 'draw') row.draws += 1;
      else if (outcome === 'loss') row.losses += 1;
      rows.set(key, row);
    }
    if (game.book) {
      bookGames += 1;
      if (game.book.status === 'deviated') bookDeviated += 1;
      bookMoves += Math.ceil((game.book.endedAtPly ?? 0) / 2);
    }
  }

  const workOn: WorkItem[] = [];
  for (const motif of motifInsights.slice(0, 2)) {
    if (!motif.reliable) continue;
    workOn.push({
      id: `motif:${motif.motif}`,
      title: motifLabel(motif.motif),
      detail: `${motif.count} times in your reviewed games`,
      lessonId: motif.lessonId,
      theme: motif.theme,
    });
  }
  const weakest = phaseInsights
    .filter((p) => p.reliable && p.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))[0];
  if (weakest && (weakest.accuracy ?? 100) < 75) {
    const lessonId =
      weakest.phase === 'opening'
        ? 'opening-principles'
        : weakest.phase === 'middlegame'
          ? 'planning-basics'
          : 'king-and-pawn-endgames';
    workOn.push({
      id: `phase:${weakest.phase}`,
      title: `The ${weakest.phase}`,
      detail: `${weakest.accuracy}% accuracy over ${weakest.moves} moves — your weakest phase`,
      lessonId,
      theme: weakest.phase === 'endgame' ? 'endgame' : null,
    });
  }

  return {
    reviewedGames,
    phases: phaseInsights,
    motifs: motifInsights,
    colours: [colours.white, colours.black],
    openings: openingInsights,
    levels: [...levels.values()].sort((a, b) => a.level - b.level),
    ratings: [...ratings.values()].sort((a, b) => a.rating - b.rating),
    book: {
      games: bookGames,
      deviated: bookDeviated,
      averageBookMoves: bookGames ? Math.round((bookMoves / bookGames) * 10) / 10 : null,
    },
    workOn: workOn.slice(0, 3),
  };
}
