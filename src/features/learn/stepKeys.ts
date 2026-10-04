import type { Lesson, LessonStep } from './model';

/**
 * How a step's progress (`stepsDone`) and its recall card are keyed: the step's
 * own `id` when it has one, otherwise its position in the lesson. Positions shift
 * when steps are inserted or removed above, so give a step an `id` before you
 * reorder a lesson (see docs/CONTENT_GUIDE.md).
 */
export type StepKey = number | string;

export function stepKey(step: Pick<LessonStep, 'id'>, index: number): StepKey {
  return step.id ?? index;
}

/** The keys of a lesson's steps, in order. */
export function lessonStepKeys(lesson: Pick<Lesson, 'steps'>): StepKey[] {
  return lesson.steps.map((step, index) => stepKey(step, index));
}

/** The keys of the steps with a task: the positions lesson recall brings back. */
export function taskStepKeys(lesson: Pick<Lesson, 'steps'>): StepKey[] {
  return lesson.steps.flatMap((step, index) => (step.task ? [stepKey(step, index)] : []));
}

/**
 * How many of the lesson's current steps are done. Keys left behind by steps that
 * were since removed (or renamed) do not count, so a shortened lesson never shows
 * more steps done than it has.
 */
export function countStepsDone(
  lesson: Pick<Lesson, 'steps'>,
  stepsDone: readonly StepKey[] | undefined,
): number {
  if (!stepsDone || stepsDone.length === 0) return 0;
  const done = new Set(stepsDone);
  return lessonStepKeys(lesson).filter((key) => done.has(key)).length;
}

/** The index of the first step that is not done yet, or 0 when every step is. */
export function firstUnfinishedStep(
  lesson: Pick<Lesson, 'steps'>,
  stepsDone: readonly StepKey[] | undefined,
): number {
  const done = new Set(stepsDone ?? []);
  const index = lessonStepKeys(lesson).findIndex((key) => !done.has(key));
  return index === -1 ? 0 : index;
}
