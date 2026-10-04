import { useProgress } from '@/store/progress';
import { bucketsInRange, loadPuzzleIndex, loadRange } from './puzzleService';
import { buildWoodpeckerSet, WOODPECKER_NEAR } from './woodpecker';

/**
 * Builds a set of the given size around the learner's rating. Chunks are
 * loaded only until the nearest window holds enough unseen puzzles for the
 * set (every chunk samples its whole band, so that is usually one per band).
 */
export async function chooseWoodpeckerPuzzles(size: number, rating: number): Promise<string[]> {
  const index = await loadPuzzleIndex();
  const seen = useProgress.getState().seen;
  const enough = (loaded: { rating: number; id: string }[]) => {
    let count = 0;
    for (const p of loaded) {
      // The window `buildWoodpeckerSet` fills first: enough unseen puzzles there and it is done.
      if (Math.abs(p.rating - rating) <= WOODPECKER_NEAR && !(p.id in seen) && ++count >= size) {
        return true;
      }
    }
    return false;
  };
  const nearby = bucketsInRange(index, rating - 400, rating + 400).length > 0;
  const { puzzles } = nearby
    ? await loadRange(index, rating - 400, rating + 400, enough)
    : await loadRange(index, -Infinity, Infinity, enough);
  return buildWoodpeckerSet(puzzles, size, rating, seen);
}
