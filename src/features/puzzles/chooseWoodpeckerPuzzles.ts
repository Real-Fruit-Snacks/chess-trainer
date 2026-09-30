import { useProgress } from '@/store/progress';
import { bucketsInRange, loadBucket, loadPuzzleIndex } from './puzzleService';
import { buildWoodpeckerSet } from './woodpecker';

/** Builds a set of the given size around the learner's rating from the nearby buckets. */
export async function chooseWoodpeckerPuzzles(size: number, rating: number): Promise<string[]> {
  const index = await loadPuzzleIndex();
  const buckets = bucketsInRange(index, rating - 400, rating + 400);
  const pools = await Promise.all(
    (buckets.length ? buckets : index.buckets).map((b) => loadBucket(b)),
  );
  return buildWoodpeckerSet(pools.flat(), size, rating, useProgress.getState().seen);
}
