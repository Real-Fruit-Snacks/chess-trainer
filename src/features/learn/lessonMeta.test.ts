import { describe, expect, it } from 'vitest';
import { LESSON_META, getLessonMeta } from './lessonMeta';
import { metaOf } from './lessonMetaFormat';
import { lessons } from './lessons';

describe('lesson index', () => {
  it('is up to date with the lesson content (run `npm run lessons:index` if not)', () => {
    expect(LESSON_META).toEqual(lessons.map(metaOf));
  });

  it('looks lessons up by id', () => {
    expect(getLessonMeta('the-board')?.title).toBe(lessons[0]?.title);
    expect(getLessonMeta('nope')).toBeUndefined();
  });
});
