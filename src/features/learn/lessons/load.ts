import { getLessonMeta } from '../lessonMeta';
import type { LessonFile } from '../lessonMetaFormat';
import type { Lesson } from '../model';

/**
 * Loads lessons a file at a time: opening a lesson downloads only the file that
 * holds it (each file is its own chunk of the build), never the whole
 * curriculum. The lists of lessons come from the small index (lessonMeta.ts).
 */
const FILES: Record<LessonFile, () => Promise<Lesson[]>> = {
  beginner: () => import('./beginner').then((m) => m.beginnerLessons),
  beginner2: () => import('./beginner2').then((m) => m.beginnerLessons2),
  intermediate: () => import('./intermediate').then((m) => m.intermediateLessons),
  intermediate2: () => import('./intermediate2').then((m) => m.intermediateLessons2),
  intermediate3: () => import('./intermediate3').then((m) => m.intermediateLessons3),
  intermediate4: () => import('./intermediate4').then((m) => m.intermediateLessons4),
  intermediate5: () => import('./intermediate5').then((m) => m.intermediateLessons5),
  intermediate6: () => import('./intermediate6').then((m) => m.intermediateLessons6),
  advanced: () => import('./advanced').then((m) => m.advancedLessons),
  advanced2: () => import('./advanced2').then((m) => m.advancedLessons2),
  advanced3: () => import('./advanced3').then((m) => m.advancedLessons3),
  advanced4: () => import('./advanced4').then((m) => m.advancedLessons4),
  advanced5: () => import('./advanced5').then((m) => m.advancedLessons5),
  advanced6: () => import('./advanced6').then((m) => m.advancedLessons6),
};

/**
 * A promise that says whether it has settled, the way React's `use` reads one:
 * a settled one is read on the spot, without suspending the page.
 */
type Tracked<T> = Promise<T> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
};

function track<T>(promise: Promise<T>): Tracked<T> {
  const tracked = promise as Tracked<T>;
  tracked.status = 'pending';
  tracked.then(
    (value) => {
      tracked.status = 'fulfilled';
      tracked.value = value;
    },
    (reason: unknown) => {
      tracked.status = 'rejected';
      tracked.reason = reason;
    },
  );
  return tracked;
}

function settled<T>(value: T): Tracked<T> {
  const promise = Promise.resolve(value) as Tracked<T>;
  promise.status = 'fulfilled';
  promise.value = value;
  return promise;
}

const files = new Map<LessonFile, Tracked<Lesson[]>>();
const byId = new Map<string, Tracked<Lesson | undefined>>();
const groups = new Map<string, Tracked<undefined>>();
/** Every lesson loaded so far, by id. */
const loaded = new Map<string, Lesson>();

/** The promise kept under `key`, made once; one that fails is made afresh next time. */
function cached<K, T>(map: Map<K, Tracked<T>>, key: K, make: () => Promise<T>): Tracked<T> {
  const known = map.get(key);
  if (known) return known;
  const promise = track(make());
  map.set(key, promise);
  // A failed download (offline, a deploy in between) is tried again next time.
  promise.catch(() => {
    if (map.get(key) === promise) map.delete(key);
  });
  return promise;
}

function loadFile(file: LessonFile): Tracked<Lesson[]> {
  return cached(files, file, () =>
    FILES[file]().then((list) => {
      for (const lesson of list) loaded.set(lesson.id, lesson);
      return list;
    }),
  );
}

/**
 * The lesson with this id, for `use(lessonPromise(id))`: settled at once when its
 * file is loaded already, and resolving to undefined for an id no lesson has.
 */
export function lessonPromise(id: string): Promise<Lesson | undefined> {
  const meta = getLessonMeta(id);
  if (!meta) return settled(undefined);
  const known = byId.get(id);
  if (known) return known;
  const lesson = loaded.get(id);
  if (lesson) {
    // Its file came with another lesson of the same file.
    const promise = settled<Lesson | undefined>(lesson);
    byId.set(id, promise);
    return promise;
  }
  return cached(byId, id, () => loadFile(meta.file).then((list) => list.find((l) => l.id === id)));
}

/** Loads the lessons with these ids (those that exist); settled at once when they all are. */
export function lessonsPromise(ids: readonly string[]): Promise<undefined> {
  const wanted = [...new Set(ids)].filter((id) => getLessonMeta(id) && !loaded.has(id)).sort();
  if (wanted.length === 0) return settled(undefined);
  return cached(groups, wanted.join('\n'), () =>
    Promise.all(wanted.map((id) => lessonPromise(id))).then(() => undefined),
  );
}

/** A lesson already loaded (see lessonsPromise), or undefined. */
export function loadedLesson(id: string): Lesson | undefined {
  return loaded.get(id);
}
