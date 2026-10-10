/**
 * Every lesson at once, for the content tests and the build scripts. The app
 * itself never imports this module: it loads one file of lessons at a time
 * (load.ts) and lists them from the small index (lessonMeta.ts).
 */
import type { LessonFile } from '../lessonMetaFormat';
import type { Lesson } from '../model';
import { advancedLessons } from './advanced';
import { advancedLessons2 } from './advanced2';
import { advancedLessons3 } from './advanced3';
import { advancedLessons4 } from './advanced4';
import { advancedLessons5 } from './advanced5';
import { advancedLessons6 } from './advanced6';
import { beginnerLessons } from './beginner';
import { beginnerLessons2 } from './beginner2';
import { intermediateLessons } from './intermediate';
import { intermediateLessons2 } from './intermediate2';
import { intermediateLessons3 } from './intermediate3';
import { intermediateLessons4 } from './intermediate4';
import { intermediateLessons5 } from './intermediate5';
import { intermediateLessons6 } from './intermediate6';

/** The lessons of each file, in curriculum order (the order of LESSON_FILES). */
export const lessonsByFile: Record<LessonFile, Lesson[]> = {
  beginner: beginnerLessons,
  beginner2: beginnerLessons2,
  intermediate: intermediateLessons,
  intermediate2: intermediateLessons2,
  intermediate3: intermediateLessons3,
  intermediate4: intermediateLessons4,
  intermediate5: intermediateLessons5,
  intermediate6: intermediateLessons6,
  advanced: advancedLessons,
  advanced2: advancedLessons2,
  advanced3: advancedLessons3,
  advanced4: advancedLessons4,
  advanced5: advancedLessons5,
  advanced6: advancedLessons6,
};

/** All lessons in curriculum order. */
export const lessons: Lesson[] = Object.values(lessonsByFile).flat();

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}
