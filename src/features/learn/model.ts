import { Chess } from 'chess.js';
import type { DrawShape } from '@/components/board/Board';
import type { Fen, LongColor, San } from '@/chess/types';

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced';

export type LessonCategory =
  'Rules' | 'Basics' | 'Tactics' | 'Checkmates' | 'Endgames' | 'Strategy' | 'Openings' | 'Thinking';

export interface LessonTask {
  /** Instruction shown to the learner, e.g. "Fork the king and rook." */
  prompt: string;
  /** Accepted answers in SAN (e.g. "Nf3", "O-O", "exd6", "e8=Q"). */
  moves: San[];
  /** Also accept any move that delivers checkmate. */
  acceptAnyMate?: boolean;
  /** Scripted opponent reply (SAN) played automatically after a correct answer. */
  reply?: San;
  hint?: string;
  success?: string;
  /** Shown after a legal but wrong move. */
  failure?: string;
}

export interface LessonStep {
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
}

export const LEVEL_LABELS: Record<
  LessonLevel,
  { title: string; blurb: string; ratingHint: string }
> = {
  beginner: {
    title: 'Beginner',
    blurb: 'The rules, how the pieces move and the first ideas that win games.',
    ratingHint: 'up to ~800',
  },
  intermediate: {
    title: 'Intermediate',
    blurb: 'Tactical patterns, mating nets and the endgames every club player needs.',
    ratingHint: '~800–1600',
  },
  advanced: {
    title: 'Advanced',
    blurb: 'Calculation, pawn structures, prophylaxis and converting advantages.',
    ratingHint: '1600+',
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

export function lessonHasTasks(lesson: Lesson): boolean {
  return lesson.steps.some((s) => s.task);
}
