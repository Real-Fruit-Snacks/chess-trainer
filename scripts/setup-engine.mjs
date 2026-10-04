#!/usr/bin/env node
/**
 * Downloads the pinned Stockfish WASM builds into public/engine/.
 *
 * The engine is GPL-3.0 software maintained in a separate project
 * (https://github.com/nmrugg/stockfish.js). Rather than vendoring ~4 MB of
 * binaries in git — or pulling the 200 MB `stockfish` npm package into every
 * install — we fetch exactly the files we ship, verify their SHA-256 and
 * cache them locally. The script is idempotent: if the files are present and
 * their checksums match, it exits immediately.
 *
 * Two builds are installed:
 *  - lite-single: one thread, precached by the service worker, used by default.
 *  - lite (pthreads): the experimental multi-threaded engine, loaded only when
 *    the learner opts in and the page is cross-origin isolated.
 *
 * Usage:  node scripts/setup-engine.mjs [--force]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'engine');

/** Bump these together when upgrading the engine. */
export const ENGINE = {
  version: '19.0.0',
  releaseBase: 'https://github.com/nmrugg/stockfish.js/releases/download/v19.0.0/',
  files: [
    {
      name: 'stockfish-19-lite-single.js',
      sha256: 'd3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6',
      build: 'single',
    },
    {
      name: 'stockfish-19-lite-single.wasm',
      sha256: '57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387',
      build: 'single',
    },
    {
      name: 'stockfish-19-lite.js',
      sha256: '2f98d35d20bf435c16925f8955fe4b0c2062e66962799a407667218ff9ea709d',
      build: 'multi',
    },
    {
      name: 'stockfish-19-lite.wasm',
      sha256: '18727c9ade11a8ca04391ab5a298232bc6fffebe2002e7cfffac82e7ad453447',
      build: 'multi',
    },
  ],
};

const force = process.argv.includes('--force');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isValid(file) {
  const path = join(OUT_DIR, file.name);
  if (!(await exists(path))) return false;
  const data = await readFile(path);
  return sha256(data) === file.sha256;
}

async function download(file) {
  const url = ENGINE.releaseBase + file.name;
  const target = join(OUT_DIR, file.name);
  const tmp = `${target}.download`;

  process.stdout.write(`  ↓ ${file.name} … `);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  const digest = sha256(data);
  if (digest !== file.sha256) {
    throw new Error(
      `Checksum mismatch for ${file.name}\n  expected ${file.sha256}\n  received ${digest}\n` +
        'The upstream release may have been altered. Refusing to install.',
    );
  }
  await writeFile(tmp, data);
  await rename(tmp, target);
  process.stdout.write(`${(data.length / 1024).toFixed(0)} KiB ✓\n`);
}

/** What `version.json` says: the pinned engine and where its source lives. */
export function versionRecord() {
  return (
    JSON.stringify(
      {
        name: 'Stockfish.js',
        version: ENGINE.version,
        variants: ['lite-single', 'lite (pthreads)'],
        license: 'GPL-3.0-only',
        source: 'https://github.com/nmrugg/stockfish.js',
        files: ENGINE.files,
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Writes `version.json` into `dir` unless it already says exactly that, so the
 * record is right whichever way the binaries arrived (downloaded here, or put
 * in place by hand when offline). Returns whether it wrote the file.
 */
export async function writeVersionFile(dir = OUT_DIR) {
  const path = join(dir, 'version.json');
  const wanted = versionRecord();
  let current = null;
  try {
    current = await readFile(path, 'utf8');
  } catch {
    // Missing: written below.
  }
  if (current === wanted) return false;
  await writeFile(path, wanted);
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const missing = [];
  for (const file of ENGINE.files) {
    if (force || !(await isValid(file))) missing.push(file);
  }

  if (missing.length === 0) {
    console.log(`Engine v${ENGINE.version} already installed in public/engine/`);
  } else {
    console.log(
      `Installing Stockfish ${ENGINE.version} (lite: single- and multi-threaded) into public/engine/`,
    );
    for (const file of missing) {
      await rm(join(OUT_DIR, file.name), { force: true });
      await download(file);
    }
  }

  // A record for people (and the notices): nothing in the app reads it, so it is not precached.
  if (await writeVersionFile()) console.log('Wrote public/engine/version.json');
  if (missing.length) console.log('Done.');
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\nEngine setup failed: ${err.message}`);
    console.error(
      'If you are offline, download the files listed in public/engine/README.md manually.',
    );
    process.exit(1);
  });
}
