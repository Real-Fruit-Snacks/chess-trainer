import type { Fen, San } from '@/chess/types';
import { type LessonLevel, levelForRating } from '@/features/learn/model';
import { RATING_MAX, RATING_MIN, STARTING_RATINGS, type StartingRatingId } from '@/lib/rating';

/**
 * The placement quiz: a few questions about experience and knowledge plus three
 * positions to solve, turned into a recommended course, a set of first lessons
 * and a starting point for the puzzle rating. Deliberately short — two minutes —
 * because the rating itself settles after a dozen rated puzzles anyway.
 */
export type ExperienceId = StartingRatingId;

export const EXPERIENCE_OPTIONS = STARTING_RATINGS;

export const RULE_OPTIONS = [
  { id: 'castling', label: 'When castling is and is not allowed' },
  { id: 'enpassant', label: 'How en passant works' },
  { id: 'stalemate', label: 'The difference between stalemate and checkmate' },
  { id: 'promotion', label: 'Promotion — and that it does not have to be a queen' },
  { id: 'notation', label: 'Reading moves like Nf3 or O-O' },
] as const;

export type RuleId = (typeof RULE_OPTIONS)[number]['id'];

export const ENDGAME_OPTIONS = [
  { id: 'none', label: 'I would have to work it out at the board' },
  { id: 'queen', label: 'I can mate with king and queen against king' },
  { id: 'rook', label: 'I can also mate with king and rook, and I know the opposition' },
  { id: 'lucena', label: 'I know the Lucena and Philidor positions' },
] as const;

export type EndgameId = (typeof ENDGAME_OPTIONS)[number]['id'];

export const OPENING_OPTIONS = [
  { id: 'none', label: 'I play whatever looks reasonable' },
  { id: 'some', label: 'I know a few openings by name and their first moves' },
  { id: 'repertoire', label: 'I have a repertoire and know its main lines' },
] as const;

export type OpeningId = (typeof OPENING_OPTIONS)[number]['id'];

export interface TacticQuestion {
  id: string;
  /** Roughly the puzzle rating the question corresponds to. */
  rating: number;
  fen: Fen;
  prompt: string;
  /** Answer options in SAN; the first is the correct one before shuffling. */
  options: San[];
  answer: San;
  explanation: string;
  /** Puzzle theme to practise when this one is missed. */
  theme: string;
  source: string;
}

/** Three positions from Lichess games (CC0 puzzle database), easy to hard. */
export const TACTIC_QUESTIONS: readonly TacticQuestion[] = [
  {
    id: 'back-rank',
    rating: 700,
    fen: '7k/1b4pp/p7/1p1rRp2/8/2N2q2/PPP4P/6K1 w - - 0 32',
    prompt: 'White to move. Black threatens mate on g2 — but it is White’s turn.',
    options: ['Re8#', 'Rxd5', 'Nxd5'],
    answer: 'Re8#',
    explanation: 'Re8 is checkmate: the king on h8 is boxed in by its own pawns, a back-rank mate.',
    theme: 'backRankMate',
    source: 'https://lichess.org/training/j95QJ',
  },
  {
    id: 'fork',
    rating: 1300,
    fen: '8/1b1k2p1/p2p2qp/Q7/7n/7P/PP3RP1/7K w - - 5 29',
    prompt: 'White to move. Two black pieces are loose — can one move attack both?',
    options: ['Qa4+', 'Rf4', 'Qxa6'],
    answer: 'Qa4+',
    explanation:
      'Qa4+ checks the king and attacks the knight on h4 at the same time; after the check is met, Qxh4 wins a piece.',
    theme: 'fork',
    source: 'https://lichess.org/training/bysWe',
  },
  {
    id: 'quiet-move',
    rating: 1800,
    fen: '1r4k1/5p2/3p2pQ/2pq4/4R3/5PP1/6PK/8 w - - 0 30',
    prompt:
      'White to move. The checks do not work yet — find the move that creates an unstoppable threat.',
    options: ['Rh4', 'Qh8+', 'Re8+'],
    answer: 'Rh4',
    explanation:
      'Rh4 threatens Qh7+ and Qh8+, which cost Black the queen or the rook, and there is no good defence. Qh8+ at once just loses the queen to Kxh8, and Re8+ Rxe8 loses the rook — the quiet move wins.',
    theme: 'quietMove',
    source: 'https://lichess.org/training/zGUt8',
  },
];

export interface PlacementAnswers {
  experience: ExperienceId;
  rules: RuleId[];
  /** Chosen SAN for each tactic question, in TACTIC_QUESTIONS order; null when skipped. */
  tactics: (San | null)[];
  endgames: EndgameId;
  openings: OpeningId;
}

export interface PlacementResult {
  /** Suggested starting point for the puzzle rating. */
  rating: number;
  level: LessonLevel;
  courseId: 'first-steps' | 'club-player' | 'strategy-and-calculation';
  /** Puzzle themes to practise, from the tactics that were missed. */
  themes: string[];
  /** How many of the three positions were solved. */
  tacticsSolved: number;
  /** One-paragraph reading of the answers. */
  summary: string;
}

const RULE_PENALTY = 40;
const TACTIC_BONUS = 90;
const TACTIC_PENALTY = 70;
const ENDGAME_ADJUST: Record<EndgameId, number> = { none: -60, queen: 0, rook: 40, lucena: 90 };
const OPENING_ADJUST: Record<OpeningId, number> = { none: -20, some: 0, repertoire: 40 };

export function evaluatePlacement(answers: PlacementAnswers): PlacementResult {
  const base =
    EXPERIENCE_OPTIONS.find((o) => o.id === answers.experience)?.rating ??
    EXPERIENCE_OPTIONS[1].rating;
  let rating = base;
  // Someone brand new is not penalised for rules they have not met yet.
  if (answers.experience !== 'new') {
    rating -= (RULE_OPTIONS.length - answers.rules.length) * RULE_PENALTY;
  }
  let solved = 0;
  const themes: string[] = [];
  TACTIC_QUESTIONS.forEach((q, i) => {
    const chosen = answers.tactics[i] ?? null;
    if (chosen === null) return;
    if (chosen === q.answer) {
      solved += 1;
      rating += TACTIC_BONUS;
    } else {
      rating -= TACTIC_PENALTY;
      themes.push(q.theme);
    }
  });
  rating += ENDGAME_ADJUST[answers.endgames] + OPENING_ADJUST[answers.openings];
  rating = Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, rating)) / 10) * 10;

  // The same boundaries as the level labels on the Learn page (~800 and 1600).
  const level: LessonLevel = levelForRating(rating);
  const courseId =
    level === 'beginner'
      ? 'first-steps'
      : level === 'intermediate'
        ? 'club-player'
        : 'strategy-and-calculation';

  const rulesGap = answers.experience !== 'new' && answers.rules.length < RULE_OPTIONS.length;
  const parts: string[] = [];
  parts.push(
    solved === TACTIC_QUESTIONS.length
      ? 'You solved all three positions.'
      : solved === 0
        ? 'The positions were hard today — the puzzles will meet you where you are.'
        : `You solved ${solved} of the three positions.`,
  );
  if (rulesGap) {
    parts.push('A few rules are worth a quick refresher; the first lessons cover them.');
  }
  if (answers.endgames === 'none') {
    parts.push('Basic checkmates and king-and-pawn endings are the fastest way to win more games.');
  }
  if (answers.endgames === 'lucena') {
    parts.push('Your endgame knowledge is ahead of most club players.');
  }
  if (answers.openings === 'none' && level !== 'beginner') {
    parts.push('A small repertoire will save you time and trouble in the opening.');
  }
  return { rating, level, courseId, themes, tacticsSolved: solved, summary: parts.join(' ') };
}

/** Deterministic shuffle of the answer options so the right one is not always first. */
export function shuffledOptions(question: TacticQuestion, seed: number): San[] {
  const options = [...question.options];
  let s = seed || 1;
  for (let i = options.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    const a = options[i];
    const b = options[j];
    if (a !== undefined && b !== undefined) {
      options[i] = b;
      options[j] = a;
    }
  }
  return options;
}
