import { useMemo } from 'react';
import { GameTree } from '@/chess/tree';
import { repertoireStats } from '@/features/openings/model';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { dueReviews } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { useProgress } from '@/store/progress';
import { cardsFor, useRepertoire } from '@/store/repertoire';

export interface DueCount {
  puzzles: number;
  recall: number;
  openings: number;
  total: number;
}

/** Everything that is due for spaced repetition right now, for badges and reminders. */
export function useDueCount(): DueCount {
  const puzzleReviews = useProgress((s) => s.puzzleReviews);
  const lessonRecall = useProgress((s) => s.lessonRecall);
  const cards = useRepertoire((s) => s.cards);
  const custom = useRepertoire((s) => s.custom);
  const now = useNow(60_000);
  return useMemo(() => {
    const puzzles = dueReviews(puzzleReviews, now).length;
    const recall = dueReviews(lessonRecall ?? {}, now).length;
    let openings = 0;
    // Only repertoires with any cards can have something due; skip parsing the rest.
    const withCards = new Set(Object.keys(cards).map((id) => id.split('|')[0]));
    const all = [
      ...BUILT_IN_REPERTOIRES.map((r) => ({ id: r.id, color: r.color, pgn: r.pgn })),
      ...custom.map((c) => ({ id: c.id, color: c.color, pgn: c.pgn })),
    ];
    for (const rep of all) {
      if (!withCards.has(rep.id)) continue;
      try {
        openings += repertoireStats(
          GameTree.fromPgn(rep.pgn),
          rep.color,
          cardsFor(cards, rep.id),
          now,
        ).due;
      } catch {
        // A custom repertoire that no longer parses contributes nothing.
      }
    }
    return { puzzles, recall, openings, total: puzzles + recall + openings };
  }, [puzzleReviews, lessonRecall, cards, custom, now]);
}
