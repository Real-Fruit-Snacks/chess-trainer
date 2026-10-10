import { describe, expect, it } from 'vitest';
import { lessonPromise, lessonsPromise, loadedLesson } from './load';

/** The settled state the loader records for React's `use`. */
const statusOf = (promise: Promise<unknown>) => (promise as { status?: string }).status;

describe('loading lessons a file at a time', () => {
  it('resolves an unknown id to nothing, at once', async () => {
    const promise = lessonPromise('no-such-lesson');
    expect(statusOf(promise)).toBe('fulfilled');
    await expect(promise).resolves.toBeUndefined();
    expect(statusOf(lessonsPromise(['no-such-lesson']))).toBe('fulfilled');
  });

  it('loads a lesson with the rest of its file, and keeps one promise per lesson', async () => {
    expect(loadedLesson('forks')).toBeUndefined();
    const promise = lessonPromise('forks');
    expect(lessonPromise('forks')).toBe(promise);
    const lesson = await promise;
    expect(lesson?.id).toBe('forks');
    expect(loadedLesson('forks')).toBe(lesson);
    // Another lesson of the same file came with it: settled on the spot.
    const sibling = lessonPromise('pins-and-skewers');
    expect(statusOf(sibling)).toBe('fulfilled');
    expect(loadedLesson('pins-and-skewers')?.id).toBe('pins-and-skewers');
  });

  it('loads several lessons, and is settled once they all are', async () => {
    const pending = lessonsPromise(['the-board', 'calculation-method', 'the-board']);
    expect(statusOf(pending)).toBe('pending');
    await pending;
    expect(loadedLesson('the-board')?.id).toBe('the-board');
    expect(loadedLesson('calculation-method')?.id).toBe('calculation-method');
    expect(statusOf(lessonsPromise(['calculation-method', 'the-board']))).toBe('fulfilled');
  });
});
