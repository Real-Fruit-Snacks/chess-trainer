import { Chess, validateFen } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { normalizeSan } from '../taskCheck';
import { lessons } from './index';
import { parseShapes } from '../model';

describe('lesson content', () => {
  it('has unique ids', () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
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

          if (step.task) {
            const task = step.task;

            it('accepts only legal moves', () => {
              for (const san of task.moves) {
                const chess = new Chess(step.fen);
                expect(() => chess.move(san), `${san} should be legal`).not.toThrow();
              }
            });

            it('orientation matches the side to move', () => {
              const turn = step.fen.split(' ')[1] === 'b' ? 'black' : 'white';
              expect(step.orientation ?? 'white').toBe(turn);
            });

            if (task.acceptAnyMate) {
              it('every listed move is checkmate', () => {
                for (const san of task.moves) {
                  const chess = new Chess(step.fen);
                  chess.move(san);
                  expect(chess.isCheckmate(), `${san} should be mate`).toBe(true);
                }
              });

              it('all mates are listed', () => {
                const chess = new Chess(step.fen);
                const mates = chess
                  .moves({ verbose: true })
                  .filter((m) => {
                    const probe = new Chess(step.fen);
                    probe.move(m.san);
                    return probe.isCheckmate();
                  })
                  .map((m) => normalizeSan(m.san));
                expect(new Set(mates)).toEqual(new Set(task.moves.map(normalizeSan)));
              });
            }

            it('moves ending in # really are mate, moves ending in + really are check', () => {
              for (const san of task.moves) {
                const chess = new Chess(step.fen);
                const move = chess.move(san);
                if (san.endsWith('#')) expect(chess.isCheckmate()).toBe(true);
                else if (san.endsWith('+')) expect(chess.inCheck()).toBe(true);
                expect(normalizeSan(move.san)).toBe(normalizeSan(san));
              }
            });

            if (task.reply) {
              it('scripted reply is legal after every accepted move', () => {
                for (const san of task.moves) {
                  const chess = new Chess(step.fen);
                  chess.move(san);
                  expect(
                    () => chess.move(task.reply as string),
                    `${task.reply} after ${san}`,
                  ).not.toThrow();
                }
              });
            }
          }
        });
      });
    });
  }
});
