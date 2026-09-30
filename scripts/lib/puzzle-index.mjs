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
