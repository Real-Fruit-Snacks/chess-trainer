import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Icon,
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
import { digestReview } from './insights';
import { InsightsCard } from './InsightsCard';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { handOffToAnalysis } from '@/lib/handoff';
import { type OwnPuzzle, ownPuzzlesFromReview } from '@/features/puzzles/ownPuzzles';
import { missedThreatsNote, type OwnThreat, ownThreatsFromReview } from '@/features/drills/threats';
import { formatDate, formatPgnDate } from '@/lib/dates';
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
import { MAX_STORED_GAMES, sortedGames, type StoredGame, useGames } from '@/store/games';
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

const OUTCOME_LABEL = { win: 'Win', draw: 'Draw', loss: 'Loss' } as const;

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
          {list.length > 0 ? <InsightsCard list={list} player={player} /> : null}
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
  const setUsernames = useProgress((s) => s.setUsernames);
  const [source, setSource] = useState<Source>('lichess');
  const [username, setUsername] = useState(() => useProgress.getState().lichessUsername);
  const [filters, setFilters] = useState<GameFilters>({ rated: false, speed: 'all', color: 'all' });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<{ username: string; source: Source } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = useProgress.getState();
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

  // A new filter means a new list: "Load older games" must not continue the old one.
  useEffect(() => {
    setCursor(null);
    setLastFetch(null);
  }, [filters]);

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
      setUsernames(
        source === 'lichess' ? { lichessUsername: trimmed } : { chesscomUsername: trimmed },
      );
      if (!player) setPlayer(trimmed);
      const { added, dropped } = addGames(
        page.games,
        source === 'lichess' ? 'lichess' : 'chesscom',
      );
      setCursor(page.next);
      setLastFetch({ username: trimmed, source });
      if (page.games.length === 0) {
        setError(more ? 'No older games match these filters.' : 'No games match these filters.');
      } else {
        toast(
          added
            ? `Added ${added} game${added === 1 ? '' : 's'}.${dropped ? ` ${dropped} older unreviewed game${dropped === 1 ? '' : 's'} made room (the collection keeps ${MAX_STORED_GAMES}).` : ''}`
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
    const { added, dropped } = addGames(parsed, 'pgn');
    if (!player) setPlayer(guessPlayer(parsed));
    setText('');
    setError(null);
    toast(
      added
        ? `Added ${added} game${added === 1 ? '' : 's'}.${dropped ? ` ${dropped} older unreviewed game${dropped === 1 ? '' : 's'} made room (the collection keeps ${MAX_STORED_GAMES}).` : ''}`
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
            <p className="small muted" style={{ marginBottom: 0 }}>
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
      <div className="stats" data-testid="games-overview">
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
        // A row per opening, as on the games list: a table's score column ran off a phone.
        <ul role="list" className="games__openings" data-testid={`openings-${color}`}>
          {rows.map((r) => (
            <li key={r.key} className="games__opening">
              <div className="games__item-head">
                <span>
                  <span className="games__eco">{r.eco}</span>
                  {r.name}
                </span>
                <span className="small">{Math.round(r.score * 100)}%</span>
              </div>
              <ProgressBar value={r.score} label={`${r.name} score`} />
              <span className="small muted">
                {r.games} game{r.games === 1 ? '' : 's'} · {r.wins} won, {r.draws} drawn, {r.losses}{' '}
                lost
              </span>
            </li>
          ))}
        </ul>
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
        <ul role="list" className="games__deviations" data-testid="deviations">
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
  const ownThreats = useProgress((s) => s.ownThreats);
  const addOwnThreats = useProgress((s) => s.addOwnThreats);
  const {
    engine,
    status: engineStatus,
    error: engineError,
    start: startEngine,
  } = useEngine({ autoStart: false });
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ id: string; done: number; total: number } | null>(null);
  const [pending, setPending] = useState<Record<string, OwnPuzzle>>({});
  const [pendingThreats, setPendingThreats] = useState<Record<string, OwnThreat>>({});
  const [confirm, setConfirm] = useState<
    { kind: 'clear' } | { kind: 'remove'; game: StoredGame } | null
  >(null);
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
        digest: digestReview(summary),
      });
      const side = learnerColor(game, player);
      const meta = {
        title: `${game.white} – ${game.black}${game.date ? `, ${game.date}` : ''}`,
        url: game.url ?? undefined,
        rating: puzzleRating,
      };
      const puzzles = ownPuzzlesFromReview({ fens: line.fens, sans: line.sans }, summary, meta, {
        side: side ?? 'both',
        includeInaccuracies: false,
      });
      setPending((prev) => {
        const next = { ...prev };
        for (const p of puzzles) if (!ownPuzzles[p.id]) next[p.id] = p;
        return next;
      });
      // The threats the learner missed (their own moves only, when it is known which side is theirs).
      const threats = ownThreatsFromReview(summary, meta, side ?? 'both');
      setPendingThreats((prev) => {
        const next = { ...prev };
        for (const t of threats) if (!ownThreats[t.id]) next[t.id] = t;
        return next;
      });
    },
    [engine, reviewDepth, setReview, player, puzzleRating, ownPuzzles, ownThreats],
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
      let failed = false;
      try {
        // Through the hook, so the page learns the engine's status (and its error).
        await startEngine();
        if (engine().status !== 'ready') throw new Error('The engine could not start.');
        await reviewOne(game, controller.signal);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          failed = true;
          toast(
            err instanceof Error && /engine/i.test(err.message)
              ? 'The engine is not available, so the reviews were stopped.'
              : 'Review failed for one game; the rest of the queue was stopped.',
            { tone: 'danger' },
          );
        }
      } finally {
        setCurrent(null);
        // One failure stops the queue: a broken engine would fail every game the same way.
        setQueue((q) => (controller.signal.aborted || failed ? [] : q.slice(1)));
      }
    })();
  }, [queue, current, engine, startEngine, reviewOne]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openInAnalysis = (game: StoredGame, selfReview = false) => {
    void navigate(
      handOffToAnalysis(game.pgn, {
        orientation: learnerColor(game, player) ?? 'white',
        selfReview,
      }),
    );
  };

  const stopReviews = () => {
    abortRef.current?.abort();
    engine().stop();
    setQueue([]);
  };

  const unreviewed = list.filter((g) => !g.review);
  const pendingList = Object.values(pending);
  const pendingThreatList = Object.values(pendingThreats);
  const running = current !== null || queue.length > 0;

  return (
    <Card>
      <div className="row row--between">
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Games ({list.length})</h2>
        {list.length > 0 ? (
          <div className="row">
            {running ? (
              <Button size="sm" onClick={stopReviews}>
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={unreviewed.length === 0 || engineStatus === 'error'}
                title={
                  engineStatus === 'error' ? 'The engine could not start on this device' : undefined
                }
                onClick={() => setQueue(unreviewed.map((g) => g.id))}
              >
                Review all ({unreviewed.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'clear' })}>
              Clear
            </Button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm?.kind === 'clear'}
        title="Remove all imported games?"
        confirmLabel="Remove all"
        danger
        onConfirm={clear}
        onClose={() => setConfirm(null)}
      >
        Every imported game and its review is removed from this device. Puzzles you already added
        from them stay. There is no undo.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        title={
          confirm?.kind === 'remove'
            ? `Remove ${confirm.game.white} – ${confirm.game.black}?`
            : 'Remove game?'
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (confirm?.kind === 'remove') removeGame(confirm.game.id);
        }}
        onClose={() => setConfirm(null)}
      >
        The game{confirm?.kind === 'remove' && confirm.game.review ? ' and its review are' : ' is'}{' '}
        removed from this device. There is no undo.
      </ConfirmDialog>
      {engineError ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {engineError.message}{' '}
          <Button size="sm" onClick={() => void startEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}
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
      {pendingThreatList.length > 0 ? (
        <Alert tone="info">
          <div className="row row--between" data-testid="pending-threats">
            <span>{missedThreatsNote(pendingThreatList, 'games')} Practise seeing it coming.</span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const added = addOwnThreats(pendingThreatList);
                setPendingThreats({});
                toast(
                  added
                    ? `Added ${added} threat${added === 1 ? '' : 's'} — Drills → What’s the threat?`
                    : 'Those threats were already in the drill.',
                  { tone: 'success' },
                );
              }}
            >
              Add to the threat drill
            </Button>
          </div>
        </Alert>
      ) : null}
      {list.length === 0 ? (
        <p className="small muted">
          Nothing imported yet: fetch your games by username, or paste a PGN.
        </p>
      ) : (
        // One row per game, wrapping inside the card: a table's last columns (the actions)
        // were cut off at the card's edge on every screen.
        <ul role="list" className="games__list" data-testid="games-table">
          {list.map((game) => {
            const color = learnerColor(game, player);
            const outcome = color ? outcomeFor(game.result, color) : null;
            const accuracy = game.review
              ? color
                ? `${game.review.accuracy[color]}%`
                : `${game.review.accuracy.white}% / ${game.review.accuracy.black}%`
              : null;
            return (
              <li key={game.id} className="games__item">
                <div className="games__item-head">
                  <span className="games__players">
                    <span className={color === 'white' ? 'games__me' : undefined}>
                      {game.white}
                    </span>
                    {' – '}
                    <span className={color === 'black' ? 'games__me' : undefined}>
                      {game.black}
                    </span>
                  </span>
                  {outcome ? (
                    <Badge
                      tone={
                        outcome === 'win' ? 'success' : outcome === 'loss' ? 'danger' : 'neutral'
                      }
                    >
                      {OUTCOME_LABEL[outcome]}
                    </Badge>
                  ) : (
                    <span className="small muted">{game.result}</span>
                  )}
                </div>
                <p className="small muted games__item-meta">
                  {game.timestamp
                    ? formatDate(game.timestamp, siteConfig.locale)
                    : (formatPgnDate(game.date, siteConfig.locale) ?? 'Date unknown')}
                  {game.speed ? ` · ${game.speed}` : ''}
                  {game.source === 'online' ? ' · played online' : ''}
                  {' · '}
                  <span data-testid="game-accuracy">
                    {accuracy ? `accuracy ${accuracy}` : 'not reviewed'}
                  </span>
                </p>
                <div className="games__actions">
                  <Button size="sm" variant="ghost" onClick={() => openInAnalysis(game)}>
                    Analyze game
                  </Button>
                  {!game.review ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openInAnalysis(game, true)}
                      title="Find the turning points yourself, then compare with the engine"
                    >
                      Analyze it yourself
                    </Button>
                  ) : null}
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
                    className="games__remove"
                    aria-label={`Remove ${game.white} – ${game.black}`}
                    title="Remove this game"
                    onClick={() => setConfirm({ kind: 'remove', game })}
                  >
                    <Icon name="close" size={14} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="small faint" style={{ margin: '8px 0 0' }}>
        Reviews run at the “{reviewDepth}” depth from Settings. Mistakes become puzzles under{' '}
        <Link to="/puzzles/mine">Puzzles → Mine</Link>.
      </p>
    </Card>
  );
}
