#!/usr/bin/env node
/**
 * Writes src/features/learn/lessonMeta.ts: the id, title, level, category,
 * summary and length of every lesson, without the steps. Pages outside the
 * lessons themselves (Home, Progress, courses, the reference) import this
 * small module instead of the full lesson content, which keeps ~50 kB of
 * gzipped JavaScript off the first page load.
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
  const { lessons } = await server.ssrLoadModule('/src/features/learn/lessons/index.ts');
  const { metaOf, renderLessonMeta } = await server.ssrLoadModule(
    '/src/features/learn/lessonMetaFormat.ts',
  );
  const source = renderLessonMeta(lessons.map(metaOf));
  const options = (await prettier.resolveConfig(fileURLToPath(out))) ?? {};
  writeFileSync(out, await prettier.format(source, { ...options, filepath: fileURLToPath(out) }));
  console.log(`lessons:index: wrote ${lessons.length} lessons to src/features/learn/lessonMeta.ts`);
} finally {
  await server.close();
}
