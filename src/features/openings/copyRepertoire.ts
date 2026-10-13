import { type CustomRepertoire, repertoireCardId, useRepertoire } from '@/store/repertoire';
import type { Repertoire } from './repertoires';

/** The name of the learner's editable copy of a built-in repertoire. */
export function copyName(name: string): string {
  return `${name} (my copy)`;
}

/** The learner's copy of a built-in repertoire, if they made one (same name and colour). */
export function findCopy(
  repertoire: Pick<Repertoire, 'name' | 'color'>,
  custom: readonly CustomRepertoire[],
): CustomRepertoire | undefined {
  const name = copyName(repertoire.name);
  return custom.find((c) => c.name === name && c.color === repertoire.color);
}

/**
 * An editable copy of a built-in repertoire, among the learner's own (or the
 * copy made before). A new copy takes the progress made on the built-in one
 * with it, review dates and all, so nothing is learned twice and no move is
 * due in both. Returns the copy and how many moves of progress moved.
 */
export function makeEditableCopy(repertoire: Repertoire): {
  copy: CustomRepertoire;
  moved: number;
} {
  const store = useRepertoire.getState();
  const existing = findCopy(repertoire, store.custom);
  if (existing) return { copy: existing, moved: 0 };
  const copy = store.addCustom({
    name: copyName(repertoire.name),
    color: repertoire.color,
    pgn: repertoire.pgn,
  });
  const prefix = repertoireCardId(repertoire.id, '');
  let moved = 0;
  const cards: typeof store.cards = {};
  for (const [id, card] of Object.entries(useRepertoire.getState().cards)) {
    if (id.startsWith(prefix)) {
      cards[repertoireCardId(copy.id, id.slice(prefix.length))] = card;
      moved += 1;
    } else {
      cards[id] = card;
    }
  }
  if (moved > 0) useRepertoire.setState({ cards });
  return { copy, moved };
}
