import { getLesson } from './lessons';
import type { LessonStep } from './model';

/** Resolves a recall card id ("lessonId:stepIndex") to its lesson step. */
export function resolveRecallCard(
  id: string,
): { lessonId: string; stepIndex: number; step: LessonStep; title: string } | null {
  const at = id.lastIndexOf(':');
  if (at < 0) return null;
  const lessonId = id.slice(0, at);
  const stepIndex = Number(id.slice(at + 1));
  const lesson = getLesson(lessonId);
  const step = lesson?.steps[stepIndex];
  if (!lesson || !step?.task) return null;
  return { lessonId, stepIndex, step, title: lesson.title };
}

/** Recall card id for a lesson step. */
export function recallCardId(lessonId: string, stepIndex: number): string {
  return `${lessonId}:${stepIndex}`;
}
