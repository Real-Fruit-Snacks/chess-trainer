import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Spinner } from '@/components/ui';
import { ListNoMatch, ListSearch } from '@/components/list/ListSearch';
import { matchesAllWords } from '@/lib/textMatch';
import { useListParams } from '@/lib/useListParams';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { repertoireOpeningTags } from '@/features/openings/openingTags';
import { formatCount } from '@/lib/format';
import { siteConfig } from '@/site.config';
import { useRepertoire } from '@/store/repertoire';
import { loadPuzzleIndex, openingTagName, type PuzzleIndex, puzzlesForTags } from './puzzleService';

/**
 * "By opening": tactics that arose from the openings you play. Your repertoires
 * come first (custom ones are matched by the opening name of their main line),
 * then every opening family in the library.
 */
export function OpeningCatalog() {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const custom = useRepertoire((s) => s.custom);
  const [customTags, setCustomTags] = useState<Record<string, string[]>>({});
  // The search is kept in the address, so Back from an opening's puzzles returns to it.
  const list = useListParams();
  const query = list.get('q');

  useEffect(() => {
    loadPuzzleIndex()
      .then(setIndex)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      custom.map(async (rep) => [rep.id, await repertoireOpeningTags(rep.pgn)] as const),
    ).then((entries) => {
      if (!cancelled) setCustomTags(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [custom]);

  const families = useMemo(
    () =>
      index
        ? Object.entries(index.openings ?? {})
            .filter(([, count]) => count >= 10)
            .sort((a, b) => b[1] - a[1])
        : [],
    [index],
  );

  if (error) return <Alert tone="danger">Could not load the puzzle index: {error}</Alert>;
  if (!index) return <Spinner label="Loading openings…" />;

  const mine = [
    ...BUILT_IN_REPERTOIRES.map((rep) => ({ id: rep.id, name: rep.name, tags: rep.openingTags })),
    ...custom.map((rep) => ({ id: rep.id, name: rep.name, tags: customTags[rep.id] ?? [] })),
  ]
    .map((rep) => ({
      ...rep,
      count: puzzlesForTags(index, rep.tags),
      // The openings it covers besides its own name (a repertoire's count is the sum of them).
      also: [...new Set(rep.tags.map(openingTagName))].filter((name) => name !== rep.name),
    }))
    .filter((rep) => rep.count > 0);
  const mineShown = mine.filter((rep) => matchesAllWords(query, rep.name, ...rep.also));
  const familiesShown = families.filter(([tag]) => matchesAllWords(query, openingTagName(tag)));
  const total = mine.length + families.length;
  const shown = mineShown.length + familiesShown.length;

  return (
    <div>
      <p className="muted">
        Tactics from the openings you play — the positions that actually come up in your games.
        Practising by opening is <strong>unrated</strong>.
      </p>
      <ListSearch
        value={query}
        onChange={(q) => list.set('q', q)}
        label="Find an opening"
        shown={shown}
        total={total}
        noun={['opening', 'openings']}
      />
      {shown === 0 ? (
        <ListNoMatch onClear={() => list.clear('q')}>No opening matches “{query}”.</ListNoMatch>
      ) : null}
      {mineShown.length ? (
        <section className="theme-section">
          <h2>From your repertoires</h2>
          <div className="grid grid--cards" data-testid="opening-repertoires">
            {mineShown.map((rep) => (
              <Link
                key={rep.id}
                // Every tag the repertoire covers: the card's count is the sum over all of them.
                to={`/puzzles/openings?opening=${encodeURIComponent(rep.tags.join(','))}`}
                className="card card--interactive theme-card"
              >
                <div className="row row--between theme-card__head">
                  <span className="card__title">{rep.name}</span>
                  <Badge>{formatCount(rep.count, siteConfig.locale)}</Badge>
                </div>
                {rep.also.length ? (
                  <p className="small muted theme-card__about">With {rep.also.join(', ')}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {familiesShown.length ? (
        <section className="theme-section">
          <h2>All openings</h2>
          {/* An index rather than cards: ninety names read best as a list. */}
          <ul className="opening-index" role="list" data-testid="opening-families">
            {familiesShown.map(([tag, count]) => (
              <li key={tag}>
                <Link
                  to={`/puzzles/openings?opening=${encodeURIComponent(tag)}`}
                  className="opening-index__item"
                >
                  <span className="opening-index__name">{openingTagName(tag)}</span>
                  <span className="opening-index__count small muted">
                    {formatCount(count, siteConfig.locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
