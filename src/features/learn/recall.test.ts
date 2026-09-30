import { describe, expect, it } from 'vitest';
import { lessons } from './lessons';
import { recallCardId, resolveRecallCard } from './recall';

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
  });
});
