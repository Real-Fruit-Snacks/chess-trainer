#!/usr/bin/env node
/**
 * Writes src/features/learn/lessonMeta.ts: the id, title, level, category,
 * summary, length and step keys of every lesson, and the file that holds it,
 * without the steps' content. The app lists lessons from this small module
 * (Learn, Home, Progress, courses, the reference) and loads a lesson's file only
 * when the lesson is opened, so no page downloads the whole curriculum.
 *
 * Runs automatically before `npm run build`; run it by hand after adding a
 * lesson (`npm run lessons:index`). A unit test fails when the file is stale.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = new URL('../src/features/learn/lessonMeta.ts', import.meta.url);

const server = await createServer({
  root,
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const { lessonsByFile } = await server.ssrLoadModule('/src/features/learn/lessons/index.ts');
  const { LESSON_FILES, metaOf, renderLessonMeta } = await server.ssrLoadModule(
    '/src/features/learn/lessonMetaFormat.ts',
  );
  const lessons = LESSON_FILES.flatMap((file) =>
    lessonsByFile[file].map((lesson) => metaOf(lesson, file)),
  );
  const source = renderLessonMeta(lessons);
  const options = (await prettier.resolveConfig(fileURLToPath(out))) ?? {};
  writeFileSync(out, await prettier.format(source, { ...options, filepath: fileURLToPath(out) }));
  console.log(`lessons:index: wrote ${lessons.length} lessons to src/features/learn/lessonMeta.ts`);
} finally {
  await server.close();
}
