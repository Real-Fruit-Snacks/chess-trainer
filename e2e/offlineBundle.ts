import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The offline copy under test (playwright.offline.config.ts): unpacked where
 * `npm run release:offline` leaves it, or wherever OFFLINE_BUNDLE says (the
 * release workflow unzips the download there first), with the launcher this
 * computer starts it with.
 */
export function offlineBundle() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const dir = resolve(process.env.OFFLINE_BUNDLE ?? join('release', `open-file-${version}`));
  const launcher =
    process.platform === 'win32'
      ? join(dir, 'Start Open File.exe')
      : process.platform === 'darwin'
        ? join(dir, 'Start Open File.command')
        : join(dir, 'start-open-file.sh');
  return { version, dir, launcher };
}
