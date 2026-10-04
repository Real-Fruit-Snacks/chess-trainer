import { beforeEach, describe, expect, it } from 'vitest';
import { validateBackupFile } from '@/store/backupSchema';
import { useProgress } from '@/store/progress';
import type { Lesson, LessonStep } from './model';
import {
  countStepsDone,
  firstUnfinishedStep,
  lessonStepKeys,
  stepKey,
  taskStepKeys,
} from './stepKeys';

const task = { prompt: 'Move.', moves: ['e4'] };
const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
const step = (id?: string, withTask = false): LessonStep => ({
  ...(id ? { id } : {}),
  text: 'x',
  fen,
  ...(withTask ? { task } : {}),
});
const lesson = (steps: LessonStep[]): Pick<Lesson, 'steps'> => ({ steps });

describe('step keys', () => {
  it('key a step by its id, or by its position without one', () => {
    expect(stepKey({ id: 'fork-the-king' }, 3)).toBe('fork-the-king');
    expect(stepKey({}, 3)).toBe(3);
    const l = lesson([step(), step('pin', true), step(undefined, true)]);
    expect(lessonStepKeys(l)).toEqual([0, 'pin', 2]);
    expect(taskStepKeys(l)).toEqual(['pin', 2]);
  });

  it('count only the steps the lesson still has', () => {
    const l = lesson([step(), step('pin'), step()]);
    // 7 and 'gone' belong to steps that were removed since.
    expect(countStepsDone(l, [0, 7, 'gone', 'pin'])).toBe(2);
    expect(countStepsDone(l, undefined)).toBe(0);
    expect(firstUnfinishedStep(l, [0, 'pin'])).toBe(2);
    expect(firstUnfinishedStep(l, [0, 'pin', 2])).toBe(0);
  });
});

describe('lesson progress by step key', () => {
  beforeEach(() => useProgress.getState().resetAll());

  it('stores ids, and completes only once every current step is done', () => {
    const { markLessonStep } = useProgress.getState();
    const keys = [0, 'pin', 2];
    markLessonStep('demo', 'pin', keys, ['pin']);
    markLessonStep('demo', 0, keys, ['pin']);
    expect(useProgress.getState().lessons.demo?.stepsDone).toEqual([0, 'pin']);
    expect(useProgress.getState().lessons.demo?.completedAt).toBeNull();
    markLessonStep('demo', 2, keys, ['pin']);
    expect(useProgress.getState().lessons.demo?.completedAt).not.toBeNull();
    // The recall card of a step with an id is keyed by that id.
    expect(Object.keys(useProgress.getState().lessonRecall)).toEqual(['demo:pin']);
  });

  it('does not complete a shortened lesson from the keys of removed steps', () => {
    const { markLessonStep } = useProgress.getState();
    // Done under an older version of the lesson: steps 0, 1, 2 and 3.
    for (const key of [0, 1, 2, 3]) markLessonStep('demo', key, 6);
    expect(useProgress.getState().lessons.demo?.completedAt).toBeNull();
    // The lesson now has three steps with ids: four positional keys are not "three done".
    markLessonStep('demo', 'a', ['a', 'b', 'c']);
    expect(useProgress.getState().lessons.demo?.completedAt).toBeNull();
  });

  it('keeps step ids in a backup', () => {
    const lessons = { demo: { stepsDone: [0, 'pin'], completedAt: null, lastVisitedAt: 1 } };
    const result = validateBackupFile({
      app: 'chess-trainer',
      version: 7,
      progress: { onboarded: true, lessons },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shape.progress.lessons?.demo?.stepsDone).toEqual([0, 'pin']);
  });

  it('still takes a step count, keyed by index, as before', () => {
    const { markLessonStep } = useProgress.getState();
    markLessonStep('forks', 0, 2, [1]);
    markLessonStep('forks', 1, 2, [1]);
    expect(useProgress.getState().lessons.forks?.completedAt).not.toBeNull();
    expect(Object.keys(useProgress.getState().lessonRecall)).toEqual(['forks:1']);
  });
});
