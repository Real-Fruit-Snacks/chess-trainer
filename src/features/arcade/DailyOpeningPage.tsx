import { Chess } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  type IconName,
  Input,
  Spinner,
  Stat,
  LinkButton,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { Notated, San } from '@/chess/San';
import { displayOpeningName } from '@/lib/openings';
import { formatDate, localDateKey } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { type DailyOpeningState, useProgress } from '@/store/progress';
import {
  afterGuess,
  candidateLines,
  dailyLine,
  dayToDate,
  dayToShow,
  giveUp as giveUpDaily,
  gradeGuess,
  guessableLines,
  guessesTaken,
  hints,
  knownPrefix,
  liveStreak,
  MAX_GUESSES,
  movesToPgn,
  practiceLine,
  searchLines,
  shareText,
  stateForDay,
  type Tile,
} from './dailyOpening';
import { loadOpeningLines, type OpeningLine } from './openingLines';
import '@/features/play/play.css';
import './arcade.css';

type Mode = 'daily' | 'practice';

/** Every tile says what it means three ways: a tint, a glyph and (for screen readers) words. */
const TILE_ICON: Record<Tile, IconName> = {
  hit: 'check',
  near: 'swap',
  miss: 'close',
  extra: 'plus',
};

const TILE_LABEL: Record<Tile, string> = {
  hit: 'in the right place',
  near: 'in the line, but elsewhere',
  miss: 'not in the line',
  extra: 'past the end of the line',
};

const TILES: readonly Tile[] = ['hit', 'near', 'miss', 'extra'];

function TileMark({ tile }: { tile: Tile }) {
  return <Icon name={TILE_ICON[tile]} size={12} className="arcade__tile-mark" />;
}

/** Shares the result where the device can (a phone's share sheet), copies it otherwise. */
async function shareResult(text: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      // Closing the share sheet is a choice, not a failure; anything else falls back to copying.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied.', { tone: 'success' });
  } catch {
    toast('Could not access the clipboard.', { tone: 'warning' });
  }
}

export default function DailyOpeningPage() {
  const stored = useProgress((s) => s.dailyOpening);
  const setDailyOpening = useProgress((s) => s.setDailyOpening);
  const [lines, setLines] = useState<OpeningLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [practice, setPractice] = useState<DailyOpeningState | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState<OpeningLine | null>(null);
  const [query, setQuery] = useState('');
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  /** The day being played: frozen while its game is under way (see `dayToShow`). */
  const [day, setDay] = useState(localDateKey);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    document.title = `Daily Opening · ${siteConfig.name}`;
  }, []);

  // Midnight: move on to the new day's opening — but never in the middle of a game.
  useEffect(() => {
    const check = (revisited: boolean) => {
      const next = dayToShow(day, localDateKey(), useProgress.getState().dailyOpening, revisited);
      if (next !== day) setDay(next);
    };
    const timer = window.setInterval(() => check(false), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [day]);

  useEffect(() => {
    let cancelled = false;
    loadOpeningLines()
      .then((loaded) => {
        if (!cancelled) setLines(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = useMemo(() => (lines ? candidateLines(lines) : []), [lines]);
  const guessable = useMemo(() => (lines ? guessableLines(lines) : []), [lines]);
  const byName = useMemo(() => new Map(guessable.map((l) => [l.name, l])), [guessable]);
  const dailyAnswer = useMemo(
    () => (candidates.length ? dailyLine(candidates, day) : null),
    [candidates, day],
  );
  const dailyState = useMemo(() => stateForDay(stored, day), [stored, day]);

  const state = mode === 'daily' ? dailyState : practice;
  const answer = mode === 'daily' ? dailyAnswer : practiceAnswer;
  const guesses = useMemo(
    () =>
      (state?.guesses ?? [])
        .map((name) => byName.get(name))
        .filter((l): l is OpeningLine => l !== undefined),
    [state, byName],
  );
  const rows: Tile[][] = useMemo(
    () => (answer ? guesses.map((g) => gradeGuess(g, answer)) : []),
    [guesses, answer],
  );
  const prefix = useMemo(() => (answer ? knownPrefix(guesses, answer) : []), [guesses, answer]);
  const boardFen = useMemo(() => {
    const chess = new Chess();
    for (const san of prefix) {
      try {
        chess.move(san);
      } catch {
        break;
      }
    }
    return chess.fen();
  }, [prefix]);
  const matches = useMemo(() => searchLines(guessable, query), [guessable, query]);
  const wrongGuesses = guesses.filter((g) => g.name !== answer?.name).length;
  const done = state?.result !== null && state?.result !== undefined;
  const dayLabel = formatDate(dayToDate(day).getTime(), siteConfig.locale);
  const streak = liveStreak(stored, day);

  const apply = (next: DailyOpeningState) => {
    if (mode === 'daily') setDailyOpening(next);
    else setPractice(next);
  };

  const submit = (line: OpeningLine) => {
    if (!state || !answer || done) return;
    if (state.guesses.includes(line.name)) {
      toast('You already guessed that one.', { tone: 'warning' });
      return;
    }
    apply(afterGuess(state, line, answer));
    setQuery('');
  };

  const surrender = () => {
    if (!state || done) return;
    apply(giveUpDaily(state));
  };

  const startPractice = () => {
    if (!candidates.length) return;
    setMode('practice');
    setPracticeAnswer(practiceLine(candidates));
    setPractice(stateForDay(null, `practice-${Date.now()}`));
    setQuery('');
  };

  const share = () => {
    if (!state || !answer) return;
    void shareResult(
      shareText(mode === 'daily' ? day : 'practice', rows, state.result === 'solved'),
    );
  };

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Daily Opening
        </p>
        <h1>Daily Opening</h1>
        <p>
          Guess the opening of the day in {MAX_GUESSES} tries. After each guess, every move shows
          whether it is in the right place, elsewhere in the line, or not in it at all.
        </p>
      </div>

      {loadError ? (
        <Alert tone="danger">The opening book could not be loaded: {loadError}</Alert>
      ) : null}
      {!lines && !loadError ? <Spinner label="Loading the opening book" /> : null}

      {state && answer ? (
        <div className="trainer">
          <div className="play__boardcol">
            <div className="trainer__board">
              <Board fen={boardFen} orientation="white" viewOnly ariaLabel="Known moves so far" />
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }} data-testid="daily-known">
              {prefix.length ? (
                <>
                  Known so far: <Notated text={movesToPgn(prefix)} />
                </>
              ) : (
                'The board shows the moves you have placed correctly from the start.'
              )}
            </p>
          </div>

          <aside className="trainer__panel stack">
            <Card>
              <div className="row row--between">
                <strong data-testid="daily-heading">
                  {mode === 'daily' ? `Opening of ${dayLabel}` : 'Practice opening'}
                </strong>
                <Badge>
                  {state.guesses.length}/{MAX_GUESSES}
                </Badge>
              </div>
              <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: '1.2em' }}>
                {hints(answer, wrongGuesses).map((hint) => (
                  <li key={hint}>
                    <Notated text={hint} />
                  </li>
                ))}
              </ul>
              {!done ? (
                <div style={{ marginTop: 12 }}>
                  <div className="arcade__results">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Type an opening name…"
                      aria-label="Opening name"
                      autoComplete="off"
                      data-testid="daily-opening-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && matches[0]) submit(matches[0]);
                      }}
                    />
                    {matches.length ? (
                      <ul
                        className="arcade__options"
                        role="list"
                        data-testid="daily-opening-matches"
                      >
                        {matches.map((line) => (
                          <li key={line.name}>
                            <button
                              type="button"
                              className="arcade__option"
                              onClick={() => submit(line)}
                            >
                              {displayOpeningName(line.name)}{' '}
                              <span className="small muted">
                                · {line.eco} · {line.moves.length} moves
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmGiveUp(true)}
                      data-testid="daily-give-up"
                    >
                      Give up
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>

            {rows.length ? (
              <Card>
                <ol
                  className="arcade__guesses"
                  role="list"
                  aria-label="Your guesses"
                  data-testid="daily-opening-guesses"
                >
                  {rows.map((row, i) => (
                    <li key={`${guesses[i]?.name ?? i}`} className="arcade__guess">
                      <span className="arcade__guess-name">
                        {guesses[i] ? displayOpeningName(guesses[i].name) : null}
                      </span>
                      <ol
                        className="arcade__guess-moves"
                        role="list"
                        aria-label={`Moves of ${guesses[i] ? displayOpeningName(guesses[i].name) : 'the guess'}`}
                      >
                        {row.map((tile, j) => (
                          <li
                            key={j}
                            className={`arcade__tile arcade__tile--${tile}`}
                            data-tile={tile}
                          >
                            <TileMark tile={tile} />
                            <San san={guesses[i]?.moves[j] ?? ''} />
                            <span className="sr-only">: {TILE_LABEL[tile]}</span>
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
                <ul
                  className="arcade__legend small muted"
                  role="list"
                  aria-label="What the marks mean"
                >
                  {TILES.map((tile) => (
                    <li key={tile}>
                      <span className={`arcade__tile arcade__tile--${tile}`} aria-hidden="true">
                        <TileMark tile={tile} />
                      </span>{' '}
                      {TILE_LABEL[tile].charAt(0).toUpperCase() + TILE_LABEL[tile].slice(1)}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {done ? (
              <Card data-testid="daily-opening-result">
                <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
                  {state.result === 'solved' ? `Solved in ${guessesTaken(state)}` : 'Not this time'}
                </h2>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>{displayOpeningName(answer.name)}</strong> ({answer.eco}):{' '}
                  <Notated text={movesToPgn(answer.moves)} />
                </p>
                {mode === 'daily' ? (
                  <div className="arcade__scoreline" style={{ justifyContent: 'flex-start' }}>
                    <Stat value={streak} label="Streak" />
                    <Stat value={state.bestStreak} label="Best streak" />
                    <Stat value={Object.keys(state.history).length} label="Days played" />
                  </div>
                ) : null}
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={share} data-testid="daily-share">
                    {canShare ? 'Share result' : 'Copy result'}
                  </Button>
                  <Button size="sm" variant="primary" onClick={startPractice}>
                    Practise a random opening
                  </Button>
                  {mode === 'practice' ? (
                    <Button size="sm" variant="ghost" onClick={() => setMode('daily')}>
                      Back to the Daily Opening
                    </Button>
                  ) : null}
                  <LinkButton
                    size="sm"
                    to={`/analyze?pgn=${encodeURIComponent(movesToPgn(answer.moves))}`}
                  >
                    Analyze the line
                  </LinkButton>
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmGiveUp && !done}
        title={mode === 'daily' ? 'Give up the Daily Opening?' : 'Give up this opening?'}
        confirmLabel="Give up"
        cancelLabel="Keep guessing"
        danger
        onConfirm={surrender}
        onClose={() => setConfirmGiveUp(false)}
      >
        <p className="muted">
          {mode === 'practice'
            ? 'The answer is shown. Practice openings do not count towards the streak.'
            : streak > 0
              ? `It counts as a miss for ${dayLabel}: the answer is shown and your streak of ${streak} ends.`
              : `It counts as a miss for ${dayLabel}, and the answer is shown.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}
