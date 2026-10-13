import type { ClassicGame } from './games';

/** Eras for the classics filter, by year. */
export type Era = 'romantic' | 'classical' | 'modern' | 'contemporary';

export const ERAS: { id: Era; label: string; blurb: string; from: number; to: number }[] = [
  {
    id: 'romantic',
    label: 'Romantic',
    blurb: 'to 1880 — gambits and king hunts',
    from: 0,
    to: 1880,
  },
  {
    id: 'classical',
    label: 'Classical',
    blurb: '1881–1945 — Steinitz to Alekhine',
    from: 1881,
    to: 1945,
  },
  {
    id: 'modern',
    label: 'Modern',
    blurb: '1946–1990 — Botvinnik to Kasparov',
    from: 1946,
    to: 1990,
  },
  {
    id: 'contemporary',
    label: 'Contemporary',
    blurb: '1991 on — computers and the new champions',
    from: 1991,
    to: 9999,
  },
];

export function eraOf(game: Pick<ClassicGame, 'year'>): Era {
  return ERAS.find((e) => game.year >= e.from && game.year <= e.to)?.id ?? 'romantic';
}

export interface ClassicsFilter {
  era: Era | 'all';
  difficulty: 1 | 2 | 3 | 'all';
  /** 'all', 'new' (not yet played) or 'played'. */
  status: 'all' | 'new' | 'played';
}

export const DEFAULT_FILTER: ClassicsFilter = { era: 'all', difficulty: 'all', status: 'all' };

export function filterGames<T extends Pick<ClassicGame, 'id' | 'year' | 'difficulty'>>(
  games: readonly T[],
  filter: ClassicsFilter,
  played: ReadonlySet<string>,
): T[] {
  return games.filter(
    (g) =>
      (filter.era === 'all' || eraOf(g) === filter.era) &&
      (filter.difficulty === 'all' || g.difficulty === filter.difficulty) &&
      (filter.status === 'all' ||
        (filter.status === 'played' ? played.has(g.id) : !played.has(g.id))),
  );
}
