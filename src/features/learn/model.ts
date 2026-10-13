import { Chess } from 'chess.js';
import type { DrawShape } from '@/components/board/Board';
import type { Fen, LongColor, San } from '@/chess/types';

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced';

export type LessonCategory =
  'Rules' | 'Basics' | 'Tactics' | 'Checkmates' | 'Endgames' | 'Strategy' | 'Openings' | 'Thinking';

/**
 * The coach's answer to a tempting wrong move: what it runs into, and the
 * opponent's reply that shows it on the board.
 */
export interface WrongMove {
  /** E.g. "Bxc6+ is only a trade: bxc6, and the pin is gone." */
  text: string;
  /** The opponent's reply (SAN) that punishes the move, played after it on the board. */
  refute?: San;
}

/**
 * A move the learner is asked to find. The coach asks (`prompt`), nudges
 * (`hint`), reacts (`success`), explains (`why`), answers the tempting wrong
 * moves (`wrong`) and the rest (`failure`); the opponent may answer (`reply`,
 * with the coach's `replyNote`) and the line may go on (`then`).
 */
export interface LessonTask {
  /** The coach's question, e.g. "Which knight move hits both?" */
  prompt: string;
  /** Accepted answers in SAN (e.g. "Nf3", "O-O", "exd6", "e8=Q"). */
  moves: San[];
  /** Also accept any move that delivers checkmate. */
  acceptAnyMate?: boolean;
  /** A nudge towards the idea that does not name the move. */
  hint?: string;
  /** The coach's first reaction to the right move: what it does. */
  success?: string;
  /** Why it works and what to take from it, shown once the move is found or shown. */
  why?: string;
  /** Tempting wrong moves (SAN) and the coach's answer to each (a string is the text alone). */
  wrong?: Record<string, string | WrongMove>;
  /** The coach's answer to any other wrong move: it must be true of every one of them. */
  failure?: string;
  /** Scripted opponent reply (SAN) played automatically after a correct answer. */
  reply?: San;
  /** What the coach says about the reply. */
  replyNote?: string;
  /** The line goes on: the learner's next move, from the position after the reply. */
  then?: LessonTask;
}

/** A task and the ones its line goes on with, in order. */
export function taskLine(task: LessonTask | undefined): LessonTask[] {
  const line: LessonTask[] = [];
  for (let t = task; t; t = t.then) line.push(t);
  return line;
}

export interface LessonStep {
  /**
   * Stable key for progress and recall cards. Without it the step is keyed by its
   * position, so inserting a step above it shifts its progress; set one before
   * reordering a lesson's steps. Unique within the lesson.
   */
  id?: string;
  title?: string;
  /**
   * Lightweight markdown: blank-line separated paragraphs, `- ` bullet lists,
   * **bold**, *italic* and `code`.
   */
  text: string;
  fen: Fen;
  orientation?: LongColor;
  /**
   * Arrows and circles: "e2e4" draws an arrow, "e4" a circle. Append ":red",
   * ":blue", ":yellow" or ":green" (default) to pick a colour.
   */
  shapes?: string[];
  task?: LessonTask;
}

export interface Lesson {
  id: string;
  title: string;
  level: LessonLevel;
  category: LessonCategory;
  summary: string;
  /** Rough reading + solving time. */
  minutes: number;
  steps: LessonStep[];
  /** Puzzle themes to practise after the lesson. */
  practiceThemes?: string[];
  /** Drills to practise after the lesson (app paths). */
  practiceDrills?: { title: string; to: string }[];
}

/**
 * The rating at which each level starts. The level labels and the placement quiz
 * both read it, so the course a quiz result recommends always matches the
 * rating range printed next to that level.
 */
export const LEVEL_START_RATING = { intermediate: 800, advanced: 1600 } as const;

/** The lesson level for a (puzzle) rating, by `LEVEL_START_RATING`. */
export function levelForRating(rating: number): LessonLevel {
  if (rating < LEVEL_START_RATING.intermediate) return 'beginner';
  if (rating < LEVEL_START_RATING.advanced) return 'intermediate';
  return 'advanced';
}

export const LEVEL_LABELS: Record<
  LessonLevel,
  { title: string; blurb: string; ratingHint: string }
> = {
  beginner: {
    title: 'Beginner',
    blurb: 'The rules, how the pieces move and the first ideas that win games.',
    ratingHint: `up to ~${LEVEL_START_RATING.intermediate}`,
  },
  intermediate: {
    title: 'Intermediate',
    blurb: 'Tactical patterns, mating nets and the endgames every club player needs.',
    ratingHint: `~${LEVEL_START_RATING.intermediate}–${LEVEL_START_RATING.advanced}`,
  },
  advanced: {
    title: 'Advanced',
    blurb: 'Calculation, pawn structures, prophylaxis and converting advantages.',
    ratingHint: `${LEVEL_START_RATING.advanced}+`,
  },
};

/** FEN reached after a sequence of SAN moves from the start position (or from `from`). */
export function fenAfter(moves: string, from: Fen = new Chess().fen()): Fen {
  const chess = new Chess(from);
  const tokens = moves
    .replace(/\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  for (const san of tokens) chess.move(san);
  return chess.fen();
}

const BRUSHES = new Set([
  'green',
  'red',
  'blue',
  'yellow',
  'paleBlue',
  'paleGreen',
  'paleRed',
  'paleGrey',
]);

/** Converts the compact shape notation used in lesson data to chessground shapes. */
export function parseShapes(shapes: string[] | undefined): DrawShape[] {
  if (!shapes) return [];
  return shapes.flatMap((raw) => {
    const [squares, brushRaw] = raw.split(':');
    const brush = brushRaw && BRUSHES.has(brushRaw) ? brushRaw : 'green';
    if (!squares) return [];
    if (squares.length === 2) return [{ orig: squares as DrawShape['orig'], brush }];
    if (squares.length === 4) {
      return [
        {
          orig: squares.slice(0, 2) as DrawShape['orig'],
          dest: squares.slice(2, 4) as DrawShape['dest'],
          brush,
        },
      ];
    }
    return [];
  });
}
