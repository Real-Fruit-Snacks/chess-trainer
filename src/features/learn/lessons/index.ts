import type { Lesson, LessonLevel } from '../model';
import { advancedLessons } from './advanced';
import { beginnerLessons } from './beginner';
import { intermediateLessons } from './intermediate';

/** All lessons in curriculum order. */
export const lessons: Lesson[] = [...beginnerLessons, ...intermediateLessons, ...advancedLessons];

export const lessonsByLevel: Record<LessonLevel, Lesson[]> = {
  beginner: beginnerLessons,
  intermediate: intermediateLessons,
  advanced: advancedLessons,
};

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function nextLesson(id: string): Lesson | undefined {
  const index = lessons.findIndex((l) => l.id === id);
  return index >= 0 ? lessons[index + 1] : undefined;
}
