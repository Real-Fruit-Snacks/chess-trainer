import { describe, expect, it, vi } from 'vitest';
import { lessons } from './lessons';
import type * as LessonsModule from './lessons';
import { gradeRecall, recallCardId, recallCardIdFor, resolveRecallCard } from './recall';

describe('recall cards', () => {
  it('resolves ids back to task steps and rejects the rest', () => {
    const lesson = lessons.find((l) => l.steps.some((s) => s.task));
    expect(lesson).toBeDefined();
    const stepIndex = lesson?.steps.findIndex((s) => s.task) ?? -1;
    const id = recallCardId(lesson?.id ?? '', stepIndex);
    const resolved = resolveRecallCard(id);
    expect(resolved?.lessonId).toBe(lesson?.id);
    expect(resolved?.stepIndex).toBe(stepIndex);
    expect(resolved?.step.task).toBeDefined();
    expect(resolved?.title).toBe(lesson?.title);
    const textStep = lesson?.steps.findIndex((s) => !s.task) ?? -1;
    if (textStep >= 0) {
      expect(resolveRecallCard(recallCardId(lesson?.id ?? '', textStep))).toBeNull();
    }
    expect(resolveRecallCard('no-such-lesson:0')).toBeNull();
    expect(resolveRecallCard('garbage')).toBeNull();
    expect(resolveRecallCard(`${lesson?.id ?? ''}:`)).toBeNull();
  });

  it('keys a step with an id by the id, which survives steps moving around', async () => {
    const lesson = lessons.find((l) => l.steps.filter((s) => s.task).length >= 2)!;
    const at = lesson.steps.findIndex((s) => s.task);
    const step = lesson.steps[at]!;
    expect(recallCardIdFor(lesson.id, step, at)).toBe(`${lesson.id}:${step.id ?? at}`);
    // Give the step an id and move it: the card follows the step, not the position.
    vi.resetModules();
    vi.doMock('./lessons', async (importOriginal) => {
      const actual = await importOriginal<typeof LessonsModule>();
      const moved = {
        ...lesson,
        steps: [
          { ...lesson.steps[0]!, task: undefined },
          { ...step, id: 'the-task' },
        ],
      };
      return {
        ...actual,
        getLesson: (id: string) => (id === lesson.id ? moved : actual.getLesson(id)),
      };
    });
    const fresh = await import('./recall');
    const byId = fresh.resolveRecallCard(`${lesson.id}:the-task`);
    expect(byId?.stepIndex).toBe(1);
    expect(byId?.step.id).toBe('the-task');
    // An old positional card still resolves by position.
    expect(fresh.resolveRecallCard(`${lesson.id}:1`)?.step.id).toBe('the-task');
    vi.doUnmock('./lessons');
  });

  it('grades a shown answer or a wrong move as a miss, a hint as a recall that keeps its interval', () => {
    expect(gradeRecall({ revealed: true, mistakes: 0, hinted: false })).toEqual({
      outcome: 'failed',
      hinted: false,
    });
    expect(gradeRecall({ revealed: false, mistakes: 1, hinted: false }).outcome).toBe('failed');
    expect(gradeRecall({ revealed: false, mistakes: 0, hinted: false }).outcome).toBe('solved');
    expect(gradeRecall({ revealed: false, mistakes: 0, hinted: true })).toEqual({
      outcome: 'solved',
      hinted: true,
    });
  });
});
