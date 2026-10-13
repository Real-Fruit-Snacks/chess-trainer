import { useEffect, useMemo, useState } from 'react';
import type { countRepertoireDue } from './repertoireDue';
import { dueReviews } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';

export interface DueCount {
  puzzles: number;
  recall: number;
  openings: number;
  total: number;
}

type RepertoireCounter = typeof countRepertoireDue;

let counter: RepertoireCounter | null = null;
let loading: Promise<RepertoireCounter> | null = null;

/** Loads the repertoire counter once (it parses PGNs, so it is not part of the start-up code). */
function loadCounter(): Promise<RepertoireCounter> {
  loading ??= import('./repertoireDue').then((module) => {
    counter = module.countRepertoireDue;
    return counter;
  });
  return loading;
}

/**
 * Everything that is due for spaced repetition right now, for badges and
 * reminders. Puzzle reviews and lesson recall are counted at once; repertoire
 * moves as soon as the counter has loaded (only when there are cards at all).
 */
export function useDueCount(): DueCount {
  const puzzleReviews = useProgress((s) => s.puzzleReviews);
  const lessonRecall = useProgress((s) => s.lessonRecall);
  const cards = useRepertoire((s) => s.cards);
  const custom = useRepertoire((s) => s.custom);
  const now = useNow(60_000);
  const hasCards = Object.keys(cards).length > 0;
  const [ready, setReady] = useState(() => counter !== null);

  useEffect(() => {
    if (!hasCards || ready) return;
    let alive = true;
    loadCounter()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hasCards, ready]);

  return useMemo(() => {
    const puzzles = dueReviews(puzzleReviews, now).length;
    const recall = dueReviews(lessonRecall ?? {}, now).length;
    const openings = hasCards && ready && counter ? counter(cards, custom, now) : 0;
    return { puzzles, recall, openings, total: puzzles + recall + openings };
  }, [puzzleReviews, lessonRecall, cards, custom, now, hasCards, ready]);
}
