#!/usr/bin/env node
/**
 * Post-build steps for GitHub Pages.
 *
 * 1. `404.html` — Pages serves this file for any unknown path. Making it a copy
 *    of `index.html` lets deep links such as /puzzles or /learn/forks boot the
 *    SPA, which then reads the URL and renders the right route.
 * 2. `.nojekyll` — tells Pages not to run Jekyll, which would otherwise ignore
 *    files and folders that start with an underscore (Vite's asset hashes can
 *    produce those) and slow down deployments.
 */
import { copyFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

async function main() {
  try {
    await stat(join(DIST, 'index.html'));
  } catch {
    throw new Error('dist/index.html not found — run `vite build` first.');
  }

  await copyFile(join(DIST, 'index.html'), join(DIST, '404.html'));
  await writeFile(join(DIST, '.nojekyll'), '');
  console.log('postbuild: wrote dist/404.html and dist/.nojekyll');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
