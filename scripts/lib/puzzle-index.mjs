/**
 * Shared bookkeeping for public/puzzles/index.json: the per-theme and
 * per-opening counts that the practice catalogues show.
 */

/** The first-level opening tag of a puzzle ("Sicilian_Defense" from "Sicilian_Defense Sicilian_Defense_Najdorf_Variation"). */
export function openingFamily(opening) {
  if (!opening) return null;
  const first = opening.split(' ')[0];
  return first || null;
}

/** Adds a puzzle's themes, opening family and opening variation to running counts. */
export function countPuzzle(counts, puzzle) {
  for (const theme of puzzle.themes.split(' ')) {
    if (!theme) continue;
    counts.themes[theme] = (counts.themes[theme] ?? 0) + 1;
  }
  const family = openingFamily(puzzle.opening);
  if (family) counts.openings[family] = (counts.openings[family] ?? 0) + 1;
  const variation = puzzle.opening ? puzzle.opening.split(' ')[1] : null;
  if (variation)
    counts.openingVariations[variation] = (counts.openingVariations[variation] ?? 0) + 1;
}

/**
 * Deals a bucket's puzzles into chunk files so that every chunk samples the
 * whole rating band: the puzzles are sorted by rating (then id, for a stable
 * order) and handed out round-robin — puzzle i goes to chunk i mod n. Only the
 * first chunk of each band is precached, and before this it held just the
 * lowest ~25 rating points of the band. Deterministic and idempotent: dealing
 * the same set again gives the same files.
 */
export function dealChunks(puzzles, chunkSize) {
  const sorted = [...puzzles].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  const count = Math.ceil(sorted.length / chunkSize);
  const chunks = Array.from({ length: count }, () => []);
  sorted.forEach((p, i) => chunks[i % count].push(p));
  return chunks;
}

/** The rating span of one chunk, recorded in the index so a window loads only the chunks it needs. */
export function chunkRange(chunk) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of chunk) {
    if (p.rating < min) min = p.rating;
    if (p.rating > max) max = p.rating;
  }
  return chunk.length ? { min, max } : { min: 0, max: 0 };
}

export function emptyCounts() {
  return { themes: {}, openings: {}, openingVariations: {} };
}

/** Sorted copies, so the JSON is stable between runs. */
export function sortedCounts(counts) {
  const sort = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  return {
    themes: sort(counts.themes),
    openings: sort(counts.openings),
    openingVariations: sort(counts.openingVariations),
  };
}
