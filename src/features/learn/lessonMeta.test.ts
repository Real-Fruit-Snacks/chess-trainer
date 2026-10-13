import { describe, expect, it } from 'vitest';
import { LESSON_META, getLessonMeta } from './lessonMeta';
import { LESSON_FILES, metaOf } from './lessonMetaFormat';
import { lessons, lessonsByFile } from './lessons';

describe('lesson index', () => {
  it('is up to date with the lesson content (run `npm run lessons:index` if not)', () => {
    expect(LESSON_META).toEqual(
      LESSON_FILES.flatMap((file) => lessonsByFile[file].map((lesson) => metaOf(lesson, file))),
    );
    // Every lesson file is listed, in curriculum order.
    expect(LESSON_META.map((m) => m.id)).toEqual(lessons.map((l) => l.id));
    expect(Object.keys(lessonsByFile)).toEqual([...LESSON_FILES]);
  });

  it('looks lessons up by id', () => {
    expect(getLessonMeta('the-board')?.title).toBe(lessons[0]?.title);
    expect(getLessonMeta('nope')).toBeUndefined();
  });
});
