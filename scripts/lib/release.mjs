/**
 * The release checks and notes behind scripts/release-notes.mjs, as plain
 * functions so they can be tested without a tag or a workflow.
 */

/** The version a tag names: "v0.12.0" (or "refs/tags/v0.12.0") is "0.12.0". */
export function tagVersion(tag) {
  return String(tag)
    .replace(/^refs\/tags\//, '')
    .replace(/^v/, '');
}

/** Null when the tag and package.json name the same version, otherwise what is wrong. */
export function versionMismatch(tag, packageVersion) {
  const version = tagVersion(tag);
  if (version === packageVersion) return null;
  return `The tag ${tag} is version ${version}, but package.json says ${packageVersion}: bump the version or move the tag.`;
}

/** The body of the changelog's "## [version]" section (heading excluded), or null without one. */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/**
 * The live URL, read from src/site.config.ts — the one place it is written
 * down (the app's social cards are built from the same value).
 */
export function siteUrlFrom(siteConfigSource) {
  const match = /\bsiteUrl:\s*'([^']+)'/.exec(siteConfigSource);
  if (!match) throw new Error('src/site.config.ts has no siteUrl');
  return match[1];
}

/**
 * The release notes: the changelog section, a link to the live app and, when
 * the release has one, a word on its offline copy (the zip attached to it).
 * @param {string} section
 * @param {string} siteUrl
 * @param {string | null} [offlineZip]
 */
export function releaseNotes(section, siteUrl, offlineZip = null) {
  const offline = offlineZip
    ? `\n\nOffline copy: download \`${offlineZip}\` below, unzip it and start Chess Trainer, with no internet connection and nothing to install (its README.txt says how, for Windows, macOS and Linux). SHA256SUMS.txt holds its checksum.`
    : '';
  return `${section}\n\nLive app: ${siteUrl}${offline}\n`;
}
