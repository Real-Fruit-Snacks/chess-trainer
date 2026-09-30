import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/ui';
import { findOpening, loadOpenings } from '@/lib/openings';
import type { StoredGame } from '@/store/games';
import { useProgress } from '@/store/progress';
import { mainLineOfPgn } from './gameStats';
import { buildInsights, motifLabel } from './insights';
import './insights.css';

const MAX_OPENING_PLIES = 24;

/**
 * What your reviewed games say about you: accuracy by phase and colour, the
 * mistakes you make most, your openings, and what to work on next.
 */
export function InsightsCard({ list, player }: { list: StoredGame[]; player: string }) {
  const engineGames = useProgress((s) => s.games);
  const [openingsByGame, setOpeningsByGame] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    loadOpenings()
      .then((table) => {
        if (cancelled) return;
        const entries = list.map((game) => {
          const line = mainLineOfPgn(game.pgn);
          const opening = line
            ? findOpening(table, line.fens.slice(0, MAX_OPENING_PLIES + 1))
            : null;
          return [game.id, opening ? (opening.name.split(':')[0]?.trim() ?? null) : null] as const;
        });
        setOpeningsByGame(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [list]);

  const insights = useMemo(
    () => buildInsights(list, player, engineGames, openingsByGame),
    [list, player, engineGames, openingsByGame],
  );
  const reviewed = list.filter((g) => g.review?.digest).length;
  const unreviewed = list.filter((g) => !g.review).length;

  return (
    <Card data-testid="insights">
      <div className="row row--between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Insights</h2>
        <span className="small muted">
          {reviewed} reviewed game{reviewed === 1 ? '' : 's'}
          {unreviewed ? ` · ${unreviewed} not yet reviewed` : ''}
        </span>
      </div>
      {insights.reviewedGames === 0 ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Review your games (below) and the patterns in your play appear here: which phase costs you
          the most, the mistakes you repeat, and what to practise.
        </p>
      ) : (
        <div className="insights__grid">
          <section>
            <h3 className="insights__heading">Work on next</h3>
            {insights.workOn.length === 0 ? (
              <p className="small muted">Nothing stands out yet — keep reviewing.</p>
            ) : (
              <ul className="insights__list" data-testid="insights-workon">
                {insights.workOn.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="small muted"> — {item.detail}</span>
                    <span className="row" style={{ gap: 8, marginTop: 2 }}>
                      {item.lessonId ? (
                        <Link to={`/learn/${item.lessonId}`} className="small">
                          Lesson
                        </Link>
                      ) : null}
                      {item.theme ? (
                        <Link
                          to={`/puzzles/themes?theme=${encodeURIComponent(item.theme)}`}
                          className="small"
                        >
                          Puzzles
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="insights__heading">By phase</h3>
            <table className="insights__table" data-testid="insights-phases">
              <thead>
                <tr>
                  <th scope="col">Phase</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Errors / 10</th>
                </tr>
              </thead>
              <tbody>
                {insights.phases.map((p) => (
                  <tr key={p.phase}>
                    <th scope="row">{p.phase}</th>
                    <td>{p.accuracy === null ? '—' : `${p.accuracy}%`}</td>
                    <td>{p.errorRate === null ? '—' : p.errorRate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h3 className="insights__heading">Mistakes you make</h3>
            {insights.motifs.length === 0 ? (
              <p className="small muted">No recurring mistakes found.</p>
            ) : (
              <ul className="insights__list" data-testid="insights-motifs">
                {insights.motifs.slice(0, 5).map((m) => (
                  <li key={m.motif} className="row row--between">
                    <span>{motifLabel(m.motif)}</span>
                    <Badge>{m.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="insights__heading">By colour</h3>
            <table className="insights__table">
              <thead>
                <tr>
                  <th scope="col">Colour</th>
                  <th scope="col">W / D / L</th>
                  <th scope="col">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {insights.colours.map((c) => (
                  <tr key={c.color}>
                    <th scope="row">{c.color}</th>
                    <td>
                      {c.wins} / {c.draws} / {c.losses}
                    </td>
                    <td>{c.accuracy === null ? '—' : `${c.accuracy}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {insights.openings.length > 0 ? (
            <section className="insights__wide">
              <h3 className="insights__heading">By opening</h3>
              <table className="insights__table" data-testid="insights-openings">
                <thead>
                  <tr>
                    <th scope="col">Opening</th>
                    <th scope="col">Games</th>
                    <th scope="col">Score</th>
                    <th scope="col">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.openings.map((o) => (
                    <tr key={o.name}>
                      <th scope="row">{o.name}</th>
                      <td>{o.games}</td>
                      <td>{o.score}%</td>
                      <td>{o.accuracy === null ? '—' : `${o.accuracy}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  );
}
