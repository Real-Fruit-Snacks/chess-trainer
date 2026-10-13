import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { COURSES } from '@/features/learn/courses';
import { LEVEL_LABELS, LEVEL_START_RATING, levelForRating } from '@/features/learn/model';
import { evaluatePlacement, shuffledOptions, TACTIC_QUESTIONS } from './placement';

const solveAll = TACTIC_QUESTIONS.map((q) => q.answer);
const missAll = TACTIC_QUESTIONS.map((q) => q.options.find((o) => o !== q.answer) ?? null);

describe('placement quiz', () => {
  it('has legal positions whose answers are legal and whose mates are mates', () => {
    for (const q of TACTIC_QUESTIONS) {
      for (const option of q.options) {
        const chess = new Chess(q.fen);
        expect(() => chess.move(option), `${q.id}: ${option}`).not.toThrow();
        if (option.endsWith('#')) expect(chess.isCheckmate()).toBe(true);
      }
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it('sends a newcomer to the first course from a low rating', () => {
    const result = evaluatePlacement({
      experience: 'new',
      rules: [],
      tactics: [null, null, null],
      endgames: 'none',
      openings: 'none',
    });
    expect(result.rating).toBeLessThan(600);
    expect(result.courseId).toBe('first-steps');
    expect(result.level).toBe('beginner');
    expect(result.themes).toEqual([]);
  });

  it('rewards solved positions and knowledge, and clamps the rating', () => {
    const strong = evaluatePlacement({
      experience: 'strong',
      rules: ['castling', 'enpassant', 'stalemate', 'promotion', 'notation'],
      tactics: solveAll,
      endgames: 'lucena',
      openings: 'repertoire',
    });
    expect(strong.rating).toBeGreaterThan(2200);
    expect(strong.courseId).toBe('strategy-and-calculation');
    expect(strong.tacticsSolved).toBe(3);

    const casual = evaluatePlacement({
      experience: 'casual',
      rules: ['castling', 'enpassant', 'stalemate', 'promotion', 'notation'],
      tactics: [solveAll[0] ?? null, missAll[1] ?? null, null],
      endgames: 'queen',
      openings: 'some',
    });
    expect(casual.rating).toBe(1220);
    expect(casual.courseId).toBe('club-player');
    expect(casual.themes).toEqual(['fork']);
  });

  it('does not penalise a beginner for rules they have not met', () => {
    const noRules = evaluatePlacement({
      experience: 'new',
      rules: [],
      tactics: [null, null, null],
      endgames: 'none',
      openings: 'none',
    });
    const allRules = evaluatePlacement({
      experience: 'new',
      rules: ['castling', 'enpassant', 'stalemate', 'promotion', 'notation'],
      tactics: [null, null, null],
      endgames: 'none',
      openings: 'none',
    });
    expect(noRules.rating).toBe(allRules.rating);
  });

  it('recommends courses that exist', () => {
    const ids = new Set(COURSES.map((c) => c.id));
    for (const experience of ['new', 'beginner', 'casual', 'club', 'strong'] as const) {
      const result = evaluatePlacement({
        experience,
        rules: [],
        tactics: [null, null, null],
        endgames: 'none',
        openings: 'none',
      });
      expect(ids.has(result.courseId)).toBe(true);
    }
  });

  it('places by the same rating boundaries the level labels print', () => {
    expect(levelForRating(LEVEL_START_RATING.intermediate - 10)).toBe('beginner');
    expect(levelForRating(LEVEL_START_RATING.intermediate)).toBe('intermediate');
    expect(levelForRating(LEVEL_START_RATING.advanced - 10)).toBe('intermediate');
    expect(levelForRating(LEVEL_START_RATING.advanced)).toBe('advanced');
    expect(LEVEL_LABELS.beginner.ratingHint).toBe('up to ~800');
    expect(LEVEL_LABELS.intermediate.ratingHint).toBe('~800–1600');
    expect(LEVEL_LABELS.advanced.ratingHint).toBe('1600+');
    // Every combination of answers lands in the course of the level its rating reads as.
    const courseOf = { beginner: 'first-steps', intermediate: 'club-player' } as const;
    for (const experience of ['new', 'beginner', 'casual', 'club', 'strong'] as const) {
      for (const endgames of ['none', 'queen', 'rook', 'lucena'] as const) {
        for (const tactics of [[null, null, null], solveAll, missAll]) {
          const result = evaluatePlacement({
            experience,
            rules: ['castling', 'stalemate'],
            tactics,
            endgames,
            openings: 'some',
          });
          expect(result.level).toBe(levelForRating(result.rating));
          expect(result.courseId).toBe(
            courseOf[result.level as keyof typeof courseOf] ?? 'strategy-and-calculation',
          );
        }
      }
    }
  });

  it('shuffles options without losing any', () => {
    const q = TACTIC_QUESTIONS[0];
    if (!q) throw new Error('no question');
    const shuffled = shuffledOptions(q, 7);
    expect([...shuffled].sort()).toEqual([...q.options].sort());
    expect(shuffledOptions(q, 7)).toEqual(shuffled);
  });
});
