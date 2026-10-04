import { getLesson } from './lessons';
import type { LessonStep } from './model';
import { type StepKey, stepKey } from './stepKeys';
import type { StepResult } from './useLessonStep';

/**
 * How a recall attempt is graded: found without a wrong move is a recall (with a
 * hint it keeps its interval); a wrong move or "Show answer" is a miss.
 */
export function gradeRecall(result: StepResult): {
  outcome: 'solved' | 'failed';
  hinted: boolean;
} {
  return {
    outcome: result.revealed || result.mistakes > 0 ? 'failed' : 'solved',
    hinted: result.hinted,
  };
}

/**
 * Resolves a recall card id ("lessonId:stepKey") to its lesson step. The key is
 * the step's `id` when it has one, otherwise its position; cards made before a
 * step had an id keep resolving by position.
 */
export function resolveRecallCard(
  id: string,
): { lessonId: string; stepIndex: number; step: LessonStep; title: string } | null {
  const at = id.lastIndexOf(':');
  if (at < 0) return null;
  const lessonId = id.slice(0, at);
  const key = id.slice(at + 1);
  const lesson = getLesson(lessonId);
  if (!lesson || key === '') return null;
  let stepIndex = lesson.steps.findIndex((s) => s.id === key);
  if (stepIndex < 0 && /^\d+$/.test(key)) stepIndex = Number(key);
  const step = lesson.steps[stepIndex];
  if (!step?.task) return null;
  return { lessonId, stepIndex, step, title: lesson.title };
}

/** Recall card id for a lesson step (keyed by the step's id, or its position without one). */
export function recallCardId(lessonId: string, key: StepKey): string {
  return `${lessonId}:${key}`;
}

/** Recall card id for the step at `index` of a lesson. */
export function recallCardIdFor(
  lessonId: string,
  step: Pick<LessonStep, 'id'>,
  index: number,
): string {
  return recallCardId(lessonId, stepKey(step, index));
}
