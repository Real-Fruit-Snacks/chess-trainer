#!/usr/bin/env node
/**
 * Packages the offline copy of a release: the app built in dist/ (for the root
 * of a site, with every engine build and the human-like opponent), the
 * launchers for Windows, macOS and Linux (launcher/, built here with Go), the
 * scripts that start them, a README and the launchers' licence notice —
 * zipped as release/chess-trainer-<version>-offline.zip, with its checksum in
 * release/SHA256SUMS.txt. The unpacked folder stays in release/ too.
 *
 * The zip is reproducible: its entries are sorted and dated from the commit
 * (or SOURCE_DATE_EPOCH), and Go builds the launchers without paths or build IDs.
 *
 * Usage:  npm run build && npm run release:offline      (needs Go 1.24 or newer, and zip)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAUNCHERS,
  OFFLINE_PORT,
  START_SCRIPTS,
  builtForRoot,
  fillTemplate,
  offlineFolderName,
  offlineZipName,
  pinnedFiles,
  sha256Sums,
} from './lib/offline.mjs';
import { siteUrlFrom } from './lib/release.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const LAUNCHER = join(ROOT, 'launcher');
const OUT = join(ROOT, 'release');

const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

/** The SHA-256 of a file, read in chunks (the full engine is about 99 MB). */
function sha256Of(path) {
  return new Promise((done, failed) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', failed);
  });
}

/** What dist/ lacks for the offline copy, as sentences (none: it is ready). */
async function distProblems() {
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) return ['dist/ has no build: run `npm run build` first.'];
  const problems = [];
  if (!builtForRoot(readFileSync(index, 'utf8'))) {
    problems.push(
      'dist/ was built for a sub-path: the launcher serves the root of a site. Build with VITE_BASE_PATH=/ npm run build.',
    );
  }
  if (!existsSync(join(DIST, '404.html'))) problems.push('dist/404.html is missing.');
  const manifest = (path) => {
    try {
      return JSON.parse(readFileSync(join(DIST, path), 'utf8'));
    } catch {
      problems.push(`dist/${path} is missing or unreadable.`);
      return null;
    }
  };
  const pinned = pinnedFiles(manifest('engine/version.json'), manifest('maia/version.json'));
  problems.push(...pinned.problems);
  for (const { path, sha256 } of pinned.files) {
    const file = join(DIST, path);
    if (!existsSync(file)) {
      problems.push(
        `dist/${path} is missing: the copy carries the full engine and the human-like opponent (npm run engine:setup and npm run maia:setup, then build).`,
      );
    } else if ((await sha256Of(file)) !== sha256) {
      problems.push(`dist/${path} does not match its pinned SHA-256.`);
    }
  }
  return problems;
}

/** The Go toolchain's version ("1.24.7"), or null without one. */
function goVersion() {
  try {
    return execFileSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }).trim().replace(/^go/, '');
  } catch {
    return null;
  }
}

/** When the copy's files say they were made: the commit's date, so the zip is reproducible. */
function sourceDate() {
  const fromEnv = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const commit = Number(out.trim());
    if (Number.isFinite(commit) && commit > 0) return commit;
  } catch {
    // Not a git checkout: today's date will do.
  }
  return Math.floor(Date.now() / 1000);
}

/** Every file under dir, as paths relative to it with forward slashes, sorted. */
function filesUnder(dir) {
  const out = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Dates every file and folder under dir (folders last, as writing a file re-dates its folder). */
function dateTree(dir, seconds) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) dateTree(path, seconds);
    else utimesSync(path, seconds, seconds);
  }
  utimesSync(dir, seconds, seconds);
}

const version = JSON.parse(read('package.json')).version;

const problems = await distProblems();
if (problems.length > 0)
  fail('The offline copy cannot be made yet:', ...problems.map((p) => `  - ${p}`));

const go = goVersion();
if (!go) fail('Building the launchers needs Go 1.24 or newer: https://go.dev/dl/');

const folderName = offlineFolderName(version);
const folder = join(OUT, folderName);
const zipName = offlineZipName(version);
rmSync(folder, { recursive: true, force: true });
rmSync(join(OUT, zipName), { force: true });
rmSync(join(OUT, 'SHA256SUMS.txt'), { force: true });
mkdirSync(folder, { recursive: true });

console.log(`Packaging Chess Trainer ${version} for offline use, in release/${folderName}/`);

// The app, as built (without GitHub Pages' marker file).
cpSync(DIST, join(folder, 'app'), {
  recursive: true,
  filter: (path) => basename(path) !== '.nojekyll',
});

// The launchers, one per system, built the same way every time.
for (const { goos, goarch, path } of LAUNCHERS) {
  const out = join(folder, path);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(
    'go',
    [
      'build',
      '-trimpath',
      '-buildvcs=false',
      '-ldflags',
      `-s -w -buildid= -X main.version=${version}`,
      '-o',
      out,
      '.',
    ],
    {
      cwd: LAUNCHER,
      stdio: 'inherit',
      env: { ...process.env, CGO_ENABLED: '0', GOOS: goos, GOARCH: goarch, GOFLAGS: '' },
    },
  );
  chmodSync(out, 0o755);
  console.log(`  ${path} (${goos}/${goarch})`);
}

// The scripts that start the right launcher on macOS and Linux.
for (const { from, path } of START_SCRIPTS) {
  const out = join(folder, path);
  writeFileSync(out, readFileSync(join(LAUNCHER, 'bundle', from)));
  chmodSync(out, 0o755);
}

// The README, and the launchers' licence notice (they contain Go's runtime and standard library).
const siteConfig = read('src/site.config.ts');
const repositoryUrl = /\brepositoryUrl:\s*'([^']+)'/.exec(siteConfig)?.[1];
if (!repositoryUrl) fail('src/site.config.ts has no repositoryUrl');
writeFileSync(
  join(folder, 'README.txt'),
  fillTemplate(read('launcher/bundle/README.txt'), {
    VERSION: version,
    PORT: OFFLINE_PORT,
    SITE_URL: siteUrlFrom(siteConfig),
    RELEASES_URL: `${repositoryUrl}/releases`,
    REPOSITORY_URL: repositoryUrl,
  }),
);
const goRoot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
mkdirSync(join(folder, 'licences'));
writeFileSync(
  join(folder, 'licences', 'launcher.txt'),
  fillTemplate(read('launcher/bundle/launcher-licence.txt'), {
    REPOSITORY_URL: repositoryUrl,
    GO_VERSION: go,
  }) + readFileSync(join(goRoot, 'LICENSE'), 'utf8'),
);

// The zip: sorted entries, the commit's date, UTC, no owner or extra timestamps.
dateTree(folder, sourceDate());
const entries = filesUnder(folder).map((path) => `${folderName}/${path}`);
try {
  execFileSync('zip', ['-q', '-X', '-D', '-@', zipName], {
    cwd: OUT,
    input: `${entries.join('\n')}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, TZ: 'UTC' },
  });
} catch (error) {
  fail(`zip failed (is it installed?): ${error.message}`);
}

const zip = join(OUT, zipName);
const sha256 = await sha256Of(zip);
writeFileSync(join(OUT, 'SHA256SUMS.txt'), sha256Sums([{ sha256, name: zipName }]));
const megabytes = (statSync(zip).size / 1_000_000).toFixed(1);
console.log(
  `release/${zipName}: ${megabytes} MB, ${entries.length} files\nSHA-256 ${sha256} (release/SHA256SUMS.txt)`,
);
