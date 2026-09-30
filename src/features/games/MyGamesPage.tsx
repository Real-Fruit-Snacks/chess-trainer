import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LinkButton,
  ProgressBar,
  Segmented,
  Select,
  Stat,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { useEngine } from '@/engine/useEngine';
import { reviewGame } from '@/features/analyze/gameReview';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { HANDOFF_PGN_KEY } from '@/features/play/PlayPage';
import { type OwnPuzzle, ownPuzzlesFromReview } from '@/features/puzzles/ownPuzzles';
import { formatDate } from '@/lib/dates';
import {
  fetchChessComGamesPage,
  fetchLichessGamesPage,
  type GameFilters,
  type GameSpeed,
  ImportError,
  parsePgnGames,
} from '@/lib/gameImport';
import { loadOpenings } from '@/lib/openings';
import { siteConfig } from '@/site.config';
import { sortedGames, type StoredGame, useGames } from '@/store/games';
import { useProgress } from '@/store/progress';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { REVIEW_DEPTHS, useSettings } from '@/store/settings';
import { groupDeviations, repertoireDeviations } from './deviations';
import {
  guessPlayer,
  learnerColor,
  mainLineOfPgn,
  movesOfLine,
  openingStats,
  outcomeFor,
  resultSummary,
} from './gameStats';
import './games.css';

type Source = 'lichess' | 'chesscom' | 'paste';
const PAGE_SIZE = 30;

const SPEEDS: { value: GameSpeed | 'all'; label: string }[] = [
  { value: 'all', label: 'Any time control' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'classical', label: 'Classical' },
  { value: 'correspondence', label: 'Correspondence' },
];

export default function MyGamesPage() {
  const games = useGames((s) => s.games);
  const player = useGames((s) => s.player);
  const setPlayer = useGames((s) => s.setPlayer);
  const list = useMemo(() => sortedGames(games), [games]);

  useEffect(() => {
    document.title = `My games · ${siteConfig.name}`;
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>My games</h1>
        <p>
          Import your games to see which openings you play, where you leave your repertoire, and to
          turn your mistakes into puzzles. Everything stays on this device.
        </p>
      </div>

      <div className="games__layout">
        <div className="stack">
          <ImportCard />
          {list.length > 0 ? <OverviewCard list={list} player={player} /> : null}
          {list.length > 0 ? <OpeningsCard list={list} player={player} /> : null}
          {list.length > 0 ? <RepertoireCard list={list} player={player} /> : null}
        </div>
        <div className="stack">
          <Card>
            <Field
              label="Your name in the games"
              hint="Used to tell which colour you played. Filled in from the username you import with."
            >
              {(id) => (
                <Input
                  id={id}
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                  placeholder="e.g. your Lichess username"
                />
              )}
            </Field>
          </Card>
          <GamesListCard list={list} player={player} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */
function ImportCard() {
  const addGames = useGames((s) => s.addGames);
  const player = useGames((s) => s.player);
  const setPlayer = useGames((s) => s.setPlayer);
  const settings = useSettings();
  const [source, setSource] = useState<Source>('lichess');
  const [username, setUsername] = useState(settings.lichessUsername);
  const [filters, setFilters] = useState<GameFilters>({ rated: false, speed: 'all', color: 'all' });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<{ username: string; source: Source } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = useSettings.getState();
    setUsername(
      source === 'lichess'
        ? saved.lichessUsername
        : source === 'chesscom'
          ? saved.chesscomUsername
          : '',
    );
    setCursor(null);
    setError(null);
  }, [source]);

  const fetchPage = async (more: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const fetcher = source === 'lichess' ? fetchLichessGamesPage : fetchChessComGamesPage;
      const page = await fetcher(username, {
        max: PAGE_SIZE,
        signal: controller.signal,
        filters,
        cursor: more ? cursor : null,
      });
      if (controller.signal.aborted) return;
      const trimmed = username.trim();
      settings.update(
        source === 'lichess' ? { lichessUsername: trimmed } : { chesscomUsername: trimmed },
      );
      if (!player) setPlayer(trimmed);
      const added = addGames(page.games, source === 'lichess' ? 'lichess' : 'chesscom');
      setCursor(page.next);
      setLastFetch({ username: trimmed, source });
      if (page.games.length === 0) {
        setError(more ? 'No older games match these filters.' : 'No games match these filters.');
      } else {
        toast(
          added
            ? `Added ${added} game${added === 1 ? '' : 's'}.`
            : 'Those games were already imported.',
          { tone: added ? 'success' : 'info' },
        );
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof ImportError ? err.message : 'Something went wrong while fetching games.',
      );
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const addPasted = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parsePgnGames(text);
    if (parsed.length === 0) {
      setError('Could not read any games from that text.');
      return;
    }
    const added = addGames(parsed, 'pgn');
    if (!player) setPlayer(guessPlayer(parsed));
    setText('');
    setError(null);
    toast(
      added
        ? `Added ${added} game${added === 1 ? '' : 's'}.`
        : 'Those games were already imported.',
      { tone: added ? 'success' : 'info' },
    );
  };

  const canLoadMore =
    cursor !== null && lastFetch?.source === source && lastFetch.username === username.trim();

  return (
    <Card>
      <h2 style={{ fontSize: '1.15rem' }}>Import games</h2>
      <div className="stack-sm">
        <Segmented
          ariaLabel="Import source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'lichess', label: 'Lichess' },
            { value: 'chesscom', label: 'chess.com' },
            { value: 'paste', label: 'Paste PGN' },
          ]}
        />
        {source === 'paste' ? (
          <form onSubmit={addPasted} className="stack-sm">
            <textarea
              className="input"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="PGN of one or more games"
              placeholder="Paste one or more games in PGN…"
            />
            <div className="row">
              <Button type="submit" variant="primary" disabled={!text.trim()}>
                Add games
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void fetchPage(false);
            }}
          >
            <Field label={source === 'lichess' ? 'Lichess username' : 'chess.com username'}>
              {(id) => (
                <Input
                  id={id}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
            <div className="games__filters">
              <Field label="Time control">
                {(id) => (
                  <Select
                    id={id}
                    value={filters.speed ?? 'all'}
                    onChange={(e) =>
                      setFilters({ ...filters, speed: e.target.value as GameSpeed | 'all' })
                    }
                  >
                    {SPEEDS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Colour">
                {(id) => (
                  <Select
                    id={id}
                    value={filters.color ?? 'all'}
                    onChange={(e) =>
                      setFilters({ ...filters, color: e.target.value as GameFilters['color'] })
                    }
                  >
                    <option value="all">Both colours</option>
                    <option value="white">As White</option>
                    <option value="black">As Black</option>
                  </Select>
                )}
              </Field>
              <Switch
                checked={!!filters.rated}
                onChange={(v) => setFilters({ ...filters, rated: v })}
                label="Rated only"
              />
            </div>
            <div className="row">
              <Button type="submit" variant="primary" disabled={loading || !username.trim()}>
                {loading ? 'Fetching…' : `Fetch ${PAGE_SIZE} most recent`}
              </Button>
              {canLoadMore ? (
                <Button type="button" onClick={() => void fetchPage(true)} disabled={loading}>
                  Load older games
                </Button>
              ) : null}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Public games only, fetched straight from{' '}
              {source === 'lichess' ? 'lichess.org' : 'chess.com'}; nothing is uploaded anywhere.
            </p>
          </form>
        )}
        {error ? <Alert tone="warning">{error}</Alert> : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */
function OverviewCard({ list, player }: { list: StoredGame[]; player: string }) {
  const summary = resultSummary(list, player);
  const decided = summary.wins + summary.draws + summary.losses;
  const score = decided ? Math.round(((summary.wins + summary.draws / 2) / decided) * 100) : 0;
  return (
    <Card>
      <h2 style={{ fontSize: '1.15rem' }}>Overview</h2>
      <div className="progress__stats" data-testid="games-overview">
        <Stat value={list.length} label="Games imported" />
        <Stat
          value={`${summary.wins} / ${summary.draws} / ${summary.losses}`}
          label="Win / draw / loss"
        />
        <Stat value={`${score}%`} label="Score" />
      </div>
      {summary.unknown > 0 ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {summary.unknown} game{summary.unknown === 1 ? '' : 's'} could not be matched to “
          {player || '?'}
          ”. Check your name on the right.
        </p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Openings                                                            */
/* ------------------------------------------------------------------ */
function OpeningsCard({ list, player }: { list: StoredGame[]; player: string }) {
  const [table, setTable] = useState<Parameters<typeof openingStats>[2] | null>(null);
  const [color, setColor] = useState<'white' | 'black'>('white');
  useEffect(() => {
    let cancelled = false;
    loadOpenings()
      .then((t) => {
        if (!cancelled) setTable(t);
      })
      .catch(() => {
        if (!cancelled) setTable({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const stats = useMemo(
    () => (table ? openingStats(list, player, table) : null),
    [table, list, player],
  );
  const rows = stats ? stats[color] : [];
  return (
    <Card>
      <div className="row row--between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Your openings</h2>
        <Segmented
          ariaLabel="Colour"
          value={color}
          onChange={setColor}
          options={[
            { value: 'white', label: 'As White' },
            { value: 'black', label: 'As Black' },
          ]}
        />
      </div>
      {!stats ? (
        <p className="small muted">Loading opening names…</p>
      ) : rows.length === 0 ? (
        <p className="small muted">No games as {color} yet.</p>
      ) : (
        <div className="history__scroll" style={{ marginTop: 8 }}>
          <table className="history" data-testid={`openings-${color}`}>
            <thead>
              <tr>
                <th scope="col">Opening</th>
                <th scope="col" className="num">
                  Games
                </th>
                <th scope="col" className="num">
                  W / D / L
                </th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="mono faint" style={{ marginRight: 6 }}>
                      {r.eco}
                    </span>
                    {r.name}
                  </td>
                  <td className="num">{r.games}</td>
                  <td className="num">
                    {r.wins} / {r.draws} / {r.losses}
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <ProgressBar value={r.score} label={`${r.name} score`} />
                      <span className="small mono">{Math.round(r.score * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Repertoire check                                                    */
/* ------------------------------------------------------------------ */
function RepertoireCard({ list, player }: { list: StoredGame[]; player: string }) {
  const custom = useRepertoire((s) => s.custom);
  const cards = useRepertoire((s) => s.cards);
  // Compare with the repertoires the learner actually studies; fall back to
  // every built-in one so the card is still useful on day one.
  const { repertoires, started } = useMemo(() => {
    const all = [
      ...BUILT_IN_REPERTOIRES.map((r) => ({ id: r.id, name: r.name, color: r.color, pgn: r.pgn })),
      ...custom.map((c) => ({ id: c.id, name: c.name, color: c.color, pgn: c.pgn })),
    ];
    const studied = all.filter(
      (r) => Object.keys(cardsFor(cards, r.id)).length > 0 || custom.some((c) => c.id === r.id),
    );
    return studied.length > 0
      ? { repertoires: studied, started: true }
      : { repertoires: all, started: false };
  }, [custom, cards]);
  const report = useMemo(
    () => repertoireDeviations(list, player, repertoires),
    [list, player, repertoires],
  );
  const grouped = useMemo(() => groupDeviations(report.deviations), [report]);
  const inBook = report.coverage.filter((c) => c.status === 'in-book').length;
  const opponentLeft = report.coverage.filter((c) => c.status === 'opponent-left').length;
  const label = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 === 0 ? '…' : '.'}`;

  return (
    <Card>
      <h2 style={{ fontSize: '1.15rem' }}>Repertoire check</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        {started
          ? 'Compared with the repertoires you are learning. '
          : 'You have not started a repertoire yet, so every built-in one is used. '}
        Each game is followed through the repertoire that fits it best: {inBook} stayed in book,{' '}
        {opponentLeft} saw the opponent leave first, {report.deviations.length} had you leave your
        own repertoire
        {report.uncovered
          ? `, ${report.uncovered} start with a move you have no repertoire for`
          : ''}
        .
      </p>
      {grouped.length === 0 ? (
        <p className="small muted">
          No deviations found — either you followed your repertoires or your opponents took you out
          of book first.
        </p>
      ) : (
        <ul className="games__deviations" data-testid="deviations">
          {grouped.map((d) => (
            <li key={`${d.repertoireId}|${d.fen}|${d.played}`} className="games__deviation">
              <div>
                <strong>
                  {label(d.ply)} {d.played}
                </strong>{' '}
                instead of <strong>{d.recommended}</strong>
                {d.alternatives.length ? ` (or ${d.alternatives.join(', ')})` : ''} —{' '}
                <span className="muted">{d.repertoireName}</span>
                {d.count > 1 ? <Badge tone="warning">{d.count} games</Badge> : null}
              </div>
              <div className="row">
                <LinkButton size="sm" to={`/openings/${d.repertoireId}`}>
                  Study line
                </LinkButton>
                <LinkButton
                  size="sm"
                  variant="ghost"
                  to={`/analyze?fen=${encodeURIComponent(d.fen)}`}
                >
                  Analyze position
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Games list + batch review                                           */
/* ------------------------------------------------------------------ */
function GamesListCard({ list, player }: { list: StoredGame[]; player: string }) {
  const navigate = useNavigate();
  const removeGame = useGames((s) => s.removeGame);
  const setReview = useGames((s) => s.setReview);
  const clear = useGames((s) => s.clear);
  const reviewDepth = useSettings((s) => s.reviewDepth);
  const puzzleRating = useProgress((s) => Math.round(s.puzzleRating));
  const ownPuzzles = useProgress((s) => s.ownPuzzles);
  const addOwnPuzzles = useProgress((s) => s.addOwnPuzzles);
  const { engine, status: engineStatus, error: engineError } = useEngine({ autoStart: false });
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ id: string; done: number; total: number } | null>(null);
  const [pending, setPending] = useState<Record<string, OwnPuzzle>>({});
  const abortRef = useRef<AbortController | null>(null);
  const gamesRef = useRef(list);
  gamesRef.current = list;

  const reviewOne = useCallback(
    async (game: StoredGame, signal: AbortSignal) => {
      const line = mainLineOfPgn(game.pgn);
      if (!line || line.sans.length === 0) return;
      const moves = movesOfLine(line.startFen, line.sans);
      const summary = await reviewGame(engine(), line.startFen, moves, {
        depth: REVIEW_DEPTHS[reviewDepth],
        signal,
        onProgress: (done, total) => setCurrent({ id: game.id, done, total }),
      });
      setReview(game.id, {
        accuracy: summary.accuracy,
        counts: summary.counts,
        depth: summary.depth,
        at: Date.now(),
      });
      const side = learnerColor(game, player);
      const puzzles = ownPuzzlesFromReview(
        { fens: line.fens, sans: line.sans },
        summary,
        {
          title: `${game.white} – ${game.black}${game.date ? `, ${game.date}` : ''}`,
          url: game.url ?? undefined,
          rating: puzzleRating,
        },
        { side: side ?? 'both', includeInaccuracies: false },
      );
      setPending((prev) => {
        const next = { ...prev };
        for (const p of puzzles) if (!ownPuzzles[p.id]) next[p.id] = p;
        return next;
      });
    },
    [engine, reviewDepth, setReview, player, puzzleRating, ownPuzzles],
  );

  // Work through the queue one game at a time.
  useEffect(() => {
    const id = queue[0];
    if (!id || current) return;
    const game = gamesRef.current.find((g) => g.id === id);
    if (!game) {
      setQueue((q) => q.slice(1));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setCurrent({ id, done: 0, total: 1 });
    void (async () => {
      try {
        await engine().init();
        await reviewOne(game, controller.signal);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          toast('Review failed for one game.', { tone: 'danger' });
        }
      } finally {
        setCurrent(null);
        setQueue((q) => (controller.signal.aborted ? [] : q.slice(1)));
      }
    })();
  }, [queue, current, engine, reviewOne]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openInAnalysis = (game: StoredGame) => {
    sessionStorage.setItem(HANDOFF_PGN_KEY, game.pgn);
    void navigate('/analyze?from=game');
  };

  const unreviewed = list.filter((g) => !g.review);
  const pendingList = Object.values(pending);
  const running = current !== null || queue.length > 0;

  return (
    <Card>
      <div className="row row--between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Games ({list.length})</h2>
        {list.length > 0 ? (
          <div className="row">
            {running ? (
              <Button
                size="sm"
                onClick={() => {
                  abortRef.current?.abort();
                  setQueue([]);
                }}
              >
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={unreviewed.length === 0 || engineStatus === 'error'}
                onClick={() => setQueue(unreviewed.map((g) => g.id))}
              >
                Review all ({unreviewed.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm('Remove all imported games from this device?')) clear();
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </div>
      {engineError ? <Alert tone="danger">{engineError.message}</Alert> : null}
      {current ? (
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <ProgressBar value={current.done} max={current.total} label="Review progress" />
          <p className="small muted" style={{ margin: 0 }}>
            Reviewing… {queue.length} game{queue.length === 1 ? '' : 's'} left in the queue.
          </p>
        </div>
      ) : null}
      {pendingList.length > 0 ? (
        <Alert tone="info">
          <div className="row row--between">
            <span>
              {pendingList.length} mistake{pendingList.length === 1 ? '' : 's'} from your reviewed
              games can become puzzles.
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const added = addOwnPuzzles(pendingList);
                setPending({});
                toast(
                  added
                    ? `Added ${added} puzzle${added === 1 ? '' : 's'} — Puzzles → Mine.`
                    : 'Those puzzles were already saved.',
                  { tone: 'success' },
                );
              }}
            >
              Add as puzzles
            </Button>
          </div>
        </Alert>
      ) : null}
      {list.length === 0 ? (
        <p className="small muted">
          Nothing imported yet. Fetch games by username or paste a PGN on the left.
        </p>
      ) : (
        <div className="history__scroll" style={{ marginTop: 8 }}>
          <table className="history" data-testid="games-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Players</th>
                <th scope="col">Result</th>
                <th scope="col">Accuracy</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {list.map((game) => {
                const color = learnerColor(game, player);
                const outcome = color ? outcomeFor(game.result, color) : null;
                return (
                  <tr key={game.id}>
                    <td>
                      {game.timestamp
                        ? formatDate(game.timestamp, siteConfig.locale)
                        : game.date || '—'}
                    </td>
                    <td>
                      <span className={color === 'white' ? 'games__me' : undefined}>
                        {game.white}
                      </span>
                      {' – '}
                      <span className={color === 'black' ? 'games__me' : undefined}>
                        {game.black}
                      </span>
                      {game.speed ? <span className="small faint"> · {game.speed}</span> : null}
                    </td>
                    <td>
                      {outcome ? (
                        <Badge
                          tone={
                            outcome === 'win'
                              ? 'success'
                              : outcome === 'loss'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {outcome}
                        </Badge>
                      ) : (
                        game.result
                      )}
                    </td>
                    <td className="num">
                      {game.review
                        ? color
                          ? `${game.review.accuracy[color]}%`
                          : `${game.review.accuracy.white}% / ${game.review.accuracy.black}%`
                        : '—'}
                    </td>
                    <td>
                      <div className="games__actions">
                        <Button size="sm" variant="ghost" onClick={() => openInAnalysis(game)}>
                          Analyze
                        </Button>
                        {!game.review ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={running}
                            onClick={() => setQueue((q) => [...q, game.id])}
                          >
                            Review
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon
                          aria-label={`Remove ${game.white} – ${game.black}`}
                          onClick={() => removeGame(game.id)}
                        >
                          ×
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small faint" style={{ margin: '8px 0 0' }}>
        Reviews run at the “{reviewDepth}” depth from Settings. Mistakes become puzzles under{' '}
        <Link to="/puzzles/mine">Puzzles → Mine</Link>.
      </p>
    </Card>
  );
}
