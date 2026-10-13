import { MAX_WOODPECKER_IDS } from '@/store/progress';
import { loadPuzzleIndex, loadRange } from './puzzleService';

/** A shared set needs at least this many puzzles to be worth cycling. */
export const MIN_SHARED_WOODPECKER = 10;

export interface ValidatedWoodpeckerSet {
  puzzleIds: string[];
  rating: number;
  /** Ids in the link that are not in the bundled puzzles (dropped). */
  unknown: number;
  /**
   * True when a puzzle file could not be loaded (offline), so some ids could not
   * be checked; they are kept, and the trainer skips any that turn out to be gone.
   */
  partial: boolean;
}

/** Shared sets are built around their rating; their puzzles lie within this distance of it. */
const SHARED_REACH = 400;

/**
 * Cleans a shared Woodpecker set: duplicates go, the size is capped at what the
 * app itself builds, and every id is looked up among the bundled puzzles around
 * the set's rating (only as many chunks as it takes to find them all), so a
 * mistyped or outdated id never lands in a cycle as a free solve. Returns null
 * when fewer than `MIN_SHARED_WOODPECKER` puzzles remain.
 */
export async function validateSharedWoodpecker(
  puzzleIds: string[],
  rating: number,
): Promise<ValidatedWoodpeckerSet | null> {
  const unique = [...new Set(puzzleIds.filter((id) => typeof id === 'string' && id.length > 0))];
  const capped = unique.slice(0, MAX_WOODPECKER_IDS);
  if (capped.length < MIN_SHARED_WOODPECKER) return null;
  const index = await loadPuzzleIndex();
  const around = Number.isFinite(rating) ? rating : 1500;
  const wanted = new Set(capped);
  const { puzzles, failed } = await loadRange(
    index,
    around - SHARED_REACH,
    around + SHARED_REACH,
    (loaded) => loaded.filter((p) => wanted.has(p.id)).length >= wanted.size,
  );
  const known = new Set(puzzles.filter((p) => wanted.has(p.id)).map((p) => p.id));
  const missing = capped.filter((id) => !known.has(id));
  const partial = failed.length > 0 && missing.length > 0;
  const kept = partial ? capped : capped.filter((id) => known.has(id));
  if (kept.length < MIN_SHARED_WOODPECKER) return null;
  return {
    puzzleIds: kept,
    rating: around,
    unknown: partial ? 0 : missing.length,
    partial,
  };
}
