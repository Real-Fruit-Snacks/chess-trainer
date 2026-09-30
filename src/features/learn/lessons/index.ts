import type { Lesson, LessonLevel } from '../model';
import { advancedLessons } from './advanced';
import { advancedLessons2 } from './advanced2';
import { advancedLessons3 } from './advanced3';
import { advancedLessons4 } from './advanced4';
import { beginnerLessons } from './beginner';
import { beginnerLessons2 } from './beginner2';
import { intermediateLessons } from './intermediate';
import { intermediateLessons2 } from './intermediate2';
import { intermediateLessons3 } from './intermediate3';
import { intermediateLessons4 } from './intermediate4';

const beginner = [...beginnerLessons, ...beginnerLessons2];
const intermediate = [
  ...intermediateLessons,
  ...intermediateLessons2,
  ...intermediateLessons3,
  ...intermediateLessons4,
];
const advanced = [
  ...advancedLessons,
  ...advancedLessons2,
  ...advancedLessons3,
  ...advancedLessons4,
];

/** All lessons in curriculum order. */
export const lessons: Lesson[] = [...beginner, ...intermediate, ...advanced];

export const lessonsByLevel: Record<LessonLevel, Lesson[]> = {
  beginner,
  intermediate,
  advanced,
};

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function nextLesson(id: string): Lesson | undefined {
  const index = lessons.findIndex((l) => l.id === id);
  return index >= 0 ? lessons[index + 1] : undefined;
}
