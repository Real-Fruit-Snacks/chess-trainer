import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Spinner } from '@/components/ui';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { repertoireOpeningTags } from '@/features/openings/openingTags';
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
    .map((rep) => ({ ...rep, count: puzzlesForTags(index, rep.tags) }))
    .filter((rep) => rep.count > 0);

  return (
    <div className="stack">
      <p className="muted">
        Tactics from the openings you play — the positions that actually come up in your games.
        Practice by opening is <strong>unrated</strong>.
      </p>
      <section>
        <h2>From your repertoires</h2>
        <div className="grid grid--cards" data-testid="opening-repertoires">
          {mine.map((rep) => (
            <Link
              key={rep.id}
              to={`/puzzles/openings?opening=${encodeURIComponent(rep.tags[0] ?? '')}`}
              className="card card--interactive theme-card"
            >
              <div className="row row--between">
                <span className="card__title">{rep.name}</span>
                <Badge>{rep.count}</Badge>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {rep.tags.map(openingTagName).join(', ')}
              </p>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2>All openings</h2>
        <div className="grid grid--cards" data-testid="opening-families">
          {families.map(([tag, count]) => (
            <Link
              key={tag}
              to={`/puzzles/openings?opening=${encodeURIComponent(tag)}`}
              className="card card--interactive theme-card"
            >
              <div className="row row--between">
                <span className="card__title">{openingTagName(tag)}</span>
                <Badge>{count}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
