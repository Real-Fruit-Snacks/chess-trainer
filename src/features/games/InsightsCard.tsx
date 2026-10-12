import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Card } from '@/components/ui';
import { formatSpent } from '@/features/analyze/timeUse';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { displayOpeningName, findOpening, loadOpenings } from '@/lib/openings';
import type { StoredGame } from '@/store/games';
import { useProgress } from '@/store/progress';
import { mainLineOfPgn } from './gameStats';
import {
  buildInsights,
  MIN_GAMES_FOR_INSIGHT,
  MIN_MOTIF_COUNT,
  MIN_MOVES_FOR_INSIGHT,
  motifLabel,
  type TimeInsight,
  TIME_LESSON,
} from './insights';
import './insights.css';

const MAX_OPENING_PLIES = 24;
const FEW_MOVES = `Fewer than ${MIN_MOVES_FOR_INSIGHT} reviewed moves: too few to draw conclusions from.`;
const FEW_GAMES = `Fewer than ${MIN_GAMES_FOR_INSIGHT} games or ${MIN_MOVES_FOR_INSIGHT} reviewed moves: too few to draw conclusions from.`;
const FEW_TIMES = `Seen fewer than ${MIN_MOTIF_COUNT} times: not yet a pattern.`;
const FEW_CLOCK_GAMES = `Fewer than ${MIN_GAMES_FOR_INSIGHT} reviewed games with clock times: too few to draw conclusions from.`;

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
          // A Chess960 game counts for everything but the openings: it has none of these.
          const opening =
            line && !line.chess960
              ? findOpening(table, line.fens.slice(0, MAX_OPENING_PLIES + 1))
              : null;
          const family = opening ? (opening.name.split(':')[0]?.trim() ?? null) : null;
          return [game.id, family ? displayOpeningName(family) : null] as const;
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
              <ul role="list" className="insights__list" data-testid="insights-workon">
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
                  <tr
                    key={p.phase}
                    className={p.reliable ? undefined : 'insights__thin'}
                    title={p.reliable ? undefined : FEW_MOVES}
                  >
                    <th scope="row">
                      {p.phase}
                      <span className="small faint insights__count">
                        {' '}
                        · {p.moves} move{p.moves === 1 ? '' : 's'}
                      </span>
                    </th>
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
              <ul role="list" className="insights__list" data-testid="insights-motifs">
                {insights.motifs.slice(0, 5).map((m) => (
                  <li
                    key={m.motif}
                    className={`row row--between${m.reliable ? '' : ' insights__thin'}`}
                    title={m.reliable ? undefined : FEW_TIMES}
                  >
                    <span>{motifLabel(m.motif)}</span>
                    <Badge>
                      {m.count} time{m.count === 1 ? '' : 's'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {insights.motifs.some((m) => !m.reliable) ? (
              <p className="small faint" style={{ margin: '6px 0 0' }}>
                Greyed-out lines were seen fewer than {MIN_MOTIF_COUNT} times — not yet a pattern.
              </p>
            ) : null}
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
                  <tr
                    key={c.color}
                    className={c.reliable ? undefined : 'insights__thin'}
                    title={c.reliable ? undefined : FEW_GAMES}
                  >
                    <th scope="row">
                      {c.color}
                      <span className="small faint insights__count">
                        {' '}
                        · {c.games} game{c.games === 1 ? '' : 's'}
                      </span>
                    </th>
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
                    <tr
                      key={o.name}
                      className={o.reliable ? undefined : 'insights__thin'}
                      title={o.reliable ? undefined : FEW_GAMES}
                    >
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
          <TimeSection time={insights.time} />
        </div>
      )}
    </Card>
  );
}

/**
 * How the learner uses the clock, from reviewed games with clock times: how
 * often they run short, where the time goes, and whether mistakes pile up
 * when it is short.
 */
function TimeSection({ time }: { time: TimeInsight }) {
  const lesson = getLessonMeta(TIME_LESSON);
  if (time.games === 0) {
    return (
      <section className="insights__wide" data-testid="insights-time">
        <h3 className="insights__heading">Time</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Reviewed games with clock times show here how you use your clock: where the time goes, how
          often you run short, and what that costs. Games from Lichess and chess.com have them.
        </p>
      </section>
    );
  }
  const rate = (value: number | null) => (value === null ? '—' : value.toFixed(1));
  return (
    <section
      className={`insights__wide${time.reliable ? '' : ' insights__thin'}`}
      title={time.reliable ? undefined : FEW_CLOCK_GAMES}
      data-testid="insights-time"
    >
      <h3 className="insights__heading">Time</h3>
      <p className="small" style={{ margin: '0 0 6px' }}>
        Short of time in{' '}
        <strong>
          {time.shortGames} of {time.games}
        </strong>{' '}
        reviewed game{time.games === 1 ? '' : 's'} with clock times.
      </p>
      <table className="insights__table">
        <thead>
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Per move</th>
            <th scope="col">Share of your time</th>
          </tr>
        </thead>
        <tbody>
          {time.phases.map((p) => (
            <tr key={p.phase}>
              <th scope="row">
                {p.phase}
                <span className="small faint insights__count">
                  {' '}
                  · {p.moves} move{p.moves === 1 ? '' : 's'}
                </span>
              </th>
              <td>{p.perMove === null ? '—' : formatSpent(p.perMove)}</td>
              <td>{p.share === null ? '—' : `${Math.round(p.share * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className={`small${time.trouble.reliable ? '' : ' insights__thin'}`}
        style={{ margin: '6px 0 0' }}
        title={time.trouble.reliable ? undefined : FEW_MOVES}
        data-testid="insights-time-trouble"
      >
        Mistakes and blunders per 10 moves: <strong>{rate(time.trouble.rate)}</strong> when short of
        time ({time.trouble.moves} move{time.trouble.moves === 1 ? '' : 's'}),{' '}
        <strong>{rate(time.calm.rate)}</strong> otherwise.
      </p>
      <p className="small faint" style={{ margin: '4px 0 0' }}>
        Short of time: under a tenth of the starting time on the clock — 10 seconds in bullet, up to
        a minute in rapid.
        {lesson ? (
          <>
            {' '}
            <Link to={`/learn/${lesson.id}`}>Lesson: {lesson.title}</Link>
          </>
        ) : null}
      </p>
    </section>
  );
}
