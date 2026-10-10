/**
 * The offline copy of a release (scripts/package-offline.mjs): what goes in
 * it, where, and what the build must hold first — as plain data and functions,
 * so they can be tested without a build, Go or a zip.
 */

/** The launcher's port: `DefaultPort` in launcher/main.go (a test keeps the two equal). */
export const OFFLINE_PORT = 8064;

/** The launchers Go builds for the copy: the target, and where the program goes in it. */
export const LAUNCHERS = [
  { goos: 'windows', goarch: 'amd64', path: 'Start Chess Trainer.exe' },
  { goos: 'darwin', goarch: 'arm64', path: 'bin/chess-trainer-macos-arm64' },
  { goos: 'darwin', goarch: 'amd64', path: 'bin/chess-trainer-macos-x64' },
  { goos: 'linux', goarch: 'amd64', path: 'bin/chess-trainer-linux-x64' },
  { goos: 'linux', goarch: 'arm64', path: 'bin/chess-trainer-linux-arm64' },
];

/** The scripts that start a launcher (from launcher/bundle/), and their names in the copy. */
export const START_SCRIPTS = [
  { from: 'start.command', path: 'Start Chess Trainer.command' },
  { from: 'start.sh', path: 'start-chess-trainer.sh' },
];

/** The engine builds the copy carries: all four, the full engine's included. */
export const ENGINE_BUILDS = ['single', 'multi', 'full-single', 'full-multi'];

/**
 * The folder the copy unpacks to.
 * @param {string} version
 */
export function offlineFolderName(version) {
  return `chess-trainer-${version}`;
}

/**
 * The release's download.
 * @param {string} version
 */
export function offlineZipName(version) {
  return `chess-trainer-${version}-offline.zip`;
}

/**
 * Whether index.html was built for the root of a site, where the launcher
 * serves it (a build for GitHub Pages' /<repo>/ path loads nothing there).
 * @param {string} indexHtml
 */
export function builtForRoot(indexHtml) {
  return /\s(?:src|href)="\/assets\//.test(indexHtml);
}

/**
 * The files dist/ must hold for the copy to work offline in full, each with
 * the SHA-256 it was pinned to: every engine build (from engine/version.json)
 * and the human-like opponent's model and runtime (from maia/version.json).
 * Returns the files, and the problems with the two manifests.
 * @param {any} engineManifest the parsed engine/version.json (null when unreadable)
 * @param {any} maiaManifest the parsed maia/version.json (null when unreadable)
 * @returns {{ files: { path: string, sha256: string }[], problems: string[] }}
 */
export function pinnedFiles(engineManifest, maiaManifest) {
  const problems = [];
  const files = [];
  const engineFiles = Array.isArray(engineManifest?.files) ? engineManifest.files : [];
  for (const build of ENGINE_BUILDS) {
    const ofBuild = engineFiles.filter((file) => file.build === build);
    if (ofBuild.length === 0) problems.push(`engine/version.json lists no ${build} build`);
    for (const file of ofBuild) files.push({ path: `engine/${file.name}`, sha256: file.sha256 });
  }
  for (const part of ['model', 'runtime']) {
    const file = maiaManifest?.[part];
    if (file?.name && file?.sha256) files.push({ path: `maia/${file.name}`, sha256: file.sha256 });
    else problems.push(`maia/version.json names no ${part}`);
  }
  return { files, problems };
}

/**
 * Fills a launcher/bundle/ text's {{NAME}} slots; a slot left unfilled is an error.
 * @param {string} template
 * @param {Record<string, string | number>} values
 * @returns {string}
 */
export function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (slot, name) => {
    if (!(name in values)) throw new Error(`No value for ${slot}`);
    return String(values[name]);
  });
}

/**
 * The checksum file next to the download, as `sha256sum -c` reads it.
 * @param {{ sha256: string, name: string }[]} entries
 */
export function sha256Sums(entries) {
  return entries.map(({ sha256, name }) => `${sha256}  ${name}\n`).join('');
}
