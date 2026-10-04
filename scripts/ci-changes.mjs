#!/usr/bin/env node
/**
 * Tells CI whether a pull request changes anything besides documentation.
 *
 * A change that touches only documentation — Markdown (except the third-party
 * notices, which ship with the site as notices.txt), the docs folder, the issue
 * and pull-request templates — skips the build, the browsers and the audits; the
 * quality job (Prettier formats Markdown too) still runs. When in doubt it says
 * "code": a diff it cannot read runs everything.
 *
 * Usage (CI):  node scripts/ci-changes.mjs <base ref> >> "$GITHUB_OUTPUT"   # prints code=true|false
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCUMENTATION = [
  /^docs\//,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^(?!THIRD_PARTY_NOTICES\.md$).*\.md$/,
];

/** Whether the changed files are all documentation (an empty list is not). */
export function documentationOnly(files) {
  return files.length > 0 && files.every((file) => DOCUMENTATION.some((re) => re.test(file)));
}

/** The files that differ between `base` and HEAD, or null if git cannot tell. */
function changedFiles(base) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const base = process.argv[2];
  const files = base ? changedFiles(base) : null;
  const code = !files || !documentationOnly(files);
  console.error(
    files
      ? `${files.length} file(s) changed; ${code ? 'code' : 'documentation only'}`
      : 'No diff to read; running everything',
  );
  console.log(`code=${code}`);
}
