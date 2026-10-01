#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section for one version, for the GitHub release of its tag.
 *
 * Usage:  node scripts/release-notes.mjs 0.7.0
 */
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`No "## [${version}]" section in CHANGELOG.md`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
if (end < 0) end = lines.length;

const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
process.stdout.write(`${body}\n\nLive app: https://real-fruit-snacks.github.io/chess-trainer/\n`);
