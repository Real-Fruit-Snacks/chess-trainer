import { Chess, validateFen } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { COURSES } from '../courses';
import { normalizeSan } from '../taskCheck';
import { lessons } from './index';
import { type LessonTask, parseShapes, taskLine } from '../model';
import {
  PROSE_ALLOW_LIST,
  candidateStarts,
  linePositions,
  quotedLines,
  replay,
  replayFromAny,
} from './quotedLines';

/**
 * Steps allowed to run past the word limit, as "lessonId:index" (0-based). Empty:
 * every step fits — trim a step before adding it here.
 */
const LONG_STEPS = new Set<string>([]);
const MAX_STEP_WORDS = 130;

/**
 * Word limits for what the coach says around a task: short enough to read
 * beside the board while the position is fresh.
 */
const MAX_WORDS: Record<
  'prompt' | 'hint' | 'success' | 'why' | 'failure' | 'replyNote' | 'wrong',
  number
> = {
  prompt: 20,
  hint: 40,
  success: 40,
  why: 80,
  failure: 45,
  replyNote: 45,
  wrong: 50,
};

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('lesson content', () => {
  it('has unique ids', () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique step ids within a lesson', () => {
    for (const lesson of lessons) {
      const ids = lesson.steps.flatMap((s) => (s.id ? [s.id] : []));
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
      // Kebab-case words, never a bare number: a number would read as a step position.
      for (const id of ids) {
        expect(id, `${lesson.id}: step id "${id}"`).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('points its practice at pages the app has', () => {
    const linked = lessons.flatMap((l) => (l.practiceDrills ?? []).map((d) => [l.id, d.to]));
    expect(linked.length).toBeGreaterThanOrEqual(5);
    for (const [id, to] of linked) {
      expect(to, `${id}: ${to}`).toMatch(/^\/(drills\/threats|puzzles\/blind|games)$/);
    }
  });

  it('every lesson sits in the course of its level', () => {
    const courseOf = new Map<string, string>();
    for (const course of COURSES) {
      for (const unit of course.units) {
        for (const item of unit.items) {
          if (item.type === 'lesson') courseOf.set(item.id, course.level);
        }
      }
    }
    for (const lesson of lessons) {
      expect(courseOf.get(lesson.id), `${lesson.id} is in no course`).toBeDefined();
      expect(courseOf.get(lesson.id), `${lesson.id} (${lesson.level}) is in the wrong course`).toBe(
        lesson.level,
      );
    }
  });

  it(`keeps steps under ~${MAX_STEP_WORDS} words`, () => {
    const long: string[] = [];
    for (const lesson of lessons) {
      lesson.steps.forEach((step, index) => {
        const words = step.text.split(/\s+/).filter(Boolean).length;
        if (words > MAX_STEP_WORDS && !LONG_STEPS.has(`${lesson.id}:${index}`)) {
          long.push(`${lesson.id} step ${index + 1}: ${words} words`);
        }
      });
    }
    expect(long).toEqual([]);
  });

  it('keeps what the coach says around a task short', () => {
    const long: string[] = [];
    for (const lesson of lessons) {
      lesson.steps.forEach((step, index) => {
        for (const task of taskLine(step.task)) {
          const fields: [keyof typeof MAX_WORDS, string | undefined][] = [
            ['prompt', task.prompt],
            ['hint', task.hint],
            ['success', task.success],
            ['why', task.why],
            ['failure', task.failure],
            ['replyNote', task.replyNote],
            ...Object.values(task.wrong ?? {}).map(
              (a) =>
                ['wrong', typeof a === 'string' ? a : a.text] as [keyof typeof MAX_WORDS, string],
            ),
          ];
          for (const [field, text] of fields) {
            if (text && words(text) > MAX_WORDS[field]) {
              long.push(`${lesson.id} step ${index + 1} ${field}: ${words(text)} words`);
            }
          }
        }
      });
    }
    expect(long).toEqual([]);
  });

  it('asks its questions without naming the side to move (the page shows it)', () => {
    const named: string[] = [];
    for (const lesson of lessons) {
      lesson.steps.forEach((step, index) => {
        for (const task of taskLine(step.task)) {
          if (/^(white|black)\b[^.:]*\bto (move|play)\b/i.test(task.prompt)) {
            named.push(`${lesson.id} step ${index + 1}: "${task.prompt}"`);
          }
        }
      });
    }
    expect(named).toEqual([]);
  });

  for (const lesson of lessons) {
    describe(`${lesson.level} › ${lesson.title}`, () => {
      it('has at least two steps and sensible metadata', () => {
        expect(lesson.steps.length).toBeGreaterThanOrEqual(2);
        expect(lesson.minutes).toBeGreaterThan(0);
        expect(lesson.summary.length).toBeGreaterThan(10);
      });

      lesson.steps.forEach((step, index) => {
        describe(`step ${index + 1}${step.title ? ` (${step.title})` : ''}`, () => {
          it('has a legal FEN', () => {
            const result = validateFen(step.fen);
            expect(result.ok, result.error).toBe(true);
            // A position where the side *not* to move is in check is illegal.
            const parts = step.fen.split(' ');
            parts[1] = parts[1] === 'w' ? 'b' : 'w';
            parts[3] = '-'; // the en-passant square is meaningless for the other side
            const other = new Chess(parts.join(' '));
            expect(other.inCheck(), 'side not to move must not be in check').toBe(false);
          });

          it('has parseable shapes', () => {
            const shapes = parseShapes(step.shapes);
            expect(shapes.length).toBe(step.shapes?.length ?? 0);
          });

          it('quoted lines are legal and claimed mates are mate', () => {
            const starts = candidateStarts(step, lesson.steps[index - 1]);
            // A line may continue (or branch from) a line quoted earlier in the same field.
            const reached: Partial<Record<string, string[]>> = {};
            for (const line of quotedLines(step)) {
              if (PROSE_ALLOW_LIST.has(`${lesson.id}|${line.raw}`)) continue;
              const from = [...(reached[line.field] ?? []), ...starts];
              const played = replayFromAny(from, line.moves);
              if (line.moves.length >= 2 || line.mateAt >= 0) {
                expect(
                  played,
                  `"${line.raw}" (${line.field}) is not legal from any position`,
                ).not.toBe(null);
              }
              if (!played) continue;
              (reached[line.field] ??= []).unshift(...played.positions.map((p) => p.fen()));
              if (line.mateAt >= 0) {
                const upTo = line.moves.slice(0, line.mateAt + 1);
                const mates = from.some((f) => replay(f, upTo)?.at(-1)?.isCheckmate());
                expect(mates, `"${line.raw}" (${line.field}): ${upTo.at(-1)} is not mate`).toBe(
                  true,
                );
              }
            }
          });

          if (step.task) {
            it('orientation matches the side to move', () => {
              const turn = step.fen.split(' ')[1] === 'b' ? 'black' : 'white';
              expect(step.orientation ?? 'white').toBe(turn);
            });

            linePositions(step).forEach(({ task, fen }, at) => {
              describe(at === 0 ? 'its task' : `move ${at + 1} of its line`, () => {
                taskChecks(task, fen);
              });
            });

            it('goes on only after a reply, and is played out in full', () => {
              const line = taskLine(step.task);
              for (const task of line) {
                if (task.then) {
                  expect(task.reply, `${task.prompt}: a line goes on after a reply`).toBeDefined();
                }
              }
              expect(linePositions(step)).toHaveLength(line.length);
            });
          }
        });
      });
    });
  }
});

/** The checks every task gets, at its position (`fen`). */
function taskChecks(task: LessonTask, fen: string) {
  it('accepts only legal moves', () => {
    for (const san of task.moves) {
      const chess = new Chess(fen);
      expect(() => chess.move(san), `${san} should be legal`).not.toThrow();
    }
  });

  if (task.acceptAnyMate) {
    it('every listed move is checkmate', () => {
      for (const san of task.moves) {
        const chess = new Chess(fen);
        chess.move(san);
        expect(chess.isCheckmate(), `${san} should be mate`).toBe(true);
      }
    });

    it('all mates are listed', () => {
      const chess = new Chess(fen);
      const mates = chess
        .moves({ verbose: true })
        .filter((m) => {
          const probe = new Chess(fen);
          probe.move(m.san);
          return probe.isCheckmate();
        })
        .map((m) => normalizeSan(m.san));
      expect(new Set(mates)).toEqual(new Set(task.moves.map(normalizeSan)));
    });
  }

  it('moves ending in # really are mate, moves ending in + really are check', () => {
    for (const san of task.moves) {
      const chess = new Chess(fen);
      const move = chess.move(san);
      if (san.endsWith('#')) expect(chess.isCheckmate()).toBe(true);
      else if (san.endsWith('+')) expect(chess.inCheck()).toBe(true);
      expect(normalizeSan(move.san)).toBe(normalizeSan(san));
    }
  });

  if (task.reply) {
    it('scripted reply is legal after every accepted move', () => {
      for (const san of task.moves) {
        const chess = new Chess(fen);
        chess.move(san);
        expect(() => chess.move(task.reply as string), `${task.reply} after ${san}`).not.toThrow();
      }
    });
  }

  if (task.wrong) {
    it('answers wrong moves that are legal, wrong, and refuted by a legal reply', () => {
      const accepted = new Set(task.moves.map(normalizeSan));
      for (const [san, answer] of Object.entries(task.wrong ?? {})) {
        const chess = new Chess(fen);
        let move;
        try {
          move = chess.move(san);
        } catch {
          move = null;
        }
        expect(move, `${san} should be legal`).not.toBe(null);
        if (!move) continue;
        expect(normalizeSan(move.san), `${san} is written as ${move.san}`).toBe(normalizeSan(san));
        expect(accepted.has(normalizeSan(san)), `${san} is an accepted move`).toBe(false);
        if (task.acceptAnyMate) expect(chess.isCheckmate(), `${san} is mate`).toBe(false);
        const refute = typeof answer === 'string' ? undefined : answer.refute;
        if (refute) {
          expect(() => chess.move(refute), `${refute} after ${san}`).not.toThrow();
        }
      }
    });
  }
}
