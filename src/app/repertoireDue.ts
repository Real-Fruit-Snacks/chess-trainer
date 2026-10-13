import { parsePgnCached } from '@/chess/tree';
import { repertoireStats } from '@/features/openings/model';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import type { SrsCard } from '@/lib/srs';
import { cardsFor, type CustomRepertoire } from '@/store/repertoire';

/**
 * How many repertoire moves are due, across the built-in and custom
 * repertoires. It parses repertoire PGNs (chess.js and the opening data), so
 * it lives in its own chunk and the start-up code loads it only when there are
 * cards to count.
 */
export function countRepertoireDue(
  cards: Record<string, SrsCard>,
  custom: readonly Pick<CustomRepertoire, 'id' | 'color' | 'pgn'>[],
  now: number,
): number {
  let due = 0;
  // Only repertoires with any cards can have something due; skip parsing the rest.
  const withCards = new Set(Object.keys(cards).map((id) => id.split('|')[0]));
  const all = [
    ...BUILT_IN_REPERTOIRES.map((r) => ({ id: r.id, color: r.color, pgn: r.pgn })),
    ...custom.map((c) => ({ id: c.id, color: c.color, pgn: c.pgn })),
  ];
  for (const rep of all) {
    if (!withCards.has(rep.id)) continue;
    try {
      // Parsed once per PGN string: the badge re-counts every minute and on every store change.
      due += repertoireStats(parsePgnCached(rep.pgn), rep.color, cardsFor(cards, rep.id), now).due;
    } catch {
      // A custom repertoire that no longer parses contributes nothing.
    }
  }
  return due;
}
