import { Chess } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { Alert, Badge, Button, Card, Input, Spinner, Stat, LinkButton } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { localDateKey } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { type DailyOpeningState, useProgress } from '@/store/progress';
import {
  afterGuess,
  candidateLines,
  dailyLine,
  giveUp as giveUpDaily,
  gradeGuess,
  guessableLines,
  hints,
  knownPrefix,
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

export default function DailyOpeningPage() {
  const stored = useProgress((s) => s.dailyOpening);
  const setDailyOpening = useProgress((s) => s.setDailyOpening);
  const [lines, setLines] = useState<OpeningLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [practice, setPractice] = useState<DailyOpeningState | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState<OpeningLine | null>(null);
  const [query, setQuery] = useState('');
  const today = localDateKey();

  useEffect(() => {
    document.title = `Daily Opening · ${siteConfig.name}`;
  }, []);

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
    () => (candidates.length ? dailyLine(candidates, today) : null),
    [candidates, today],
  );
  const dailyState = useMemo(() => stateForDay(stored, today), [stored, today]);

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

  const share = async () => {
    if (!state || !answer) return;
    const text = shareText(mode === 'daily' ? today : 'practice', rows, state.result === 'solved');
    try {
      await navigator.clipboard.writeText(text);
      toast('Result copied.', { tone: 'success' });
    } catch {
      toast('Could not access the clipboard.', { tone: 'warning' });
    }
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
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              {prefix.length
                ? `Known so far: ${prefix.join(' ')}`
                : 'The board shows the moves you have placed correctly from the start.'}
            </p>
          </div>

          <aside className="trainer__panel stack">
            <Card>
              <div className="row row--between">
                <strong>{mode === 'daily' ? `Opening of ${today}` : 'Practice opening'}</strong>
                <Badge>
                  {state.guesses.length}/{MAX_GUESSES}
                </Badge>
              </div>
              <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: '1.2em' }}>
                {hints(answer, wrongGuesses).map((hint) => (
                  <li key={hint}>{hint}</li>
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
                      <ul className="arcade__options" data-testid="daily-opening-matches">
                        {matches.map((line) => (
                          <li key={line.name}>
                            <button
                              type="button"
                              className="arcade__option"
                              onClick={() => submit(line)}
                            >
                              {line.name}{' '}
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
                    <Button size="sm" variant="ghost" onClick={surrender}>
                      Give up
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>

            {rows.length ? (
              <Card>
                <div className="arcade__guesses" data-testid="daily-opening-guesses">
                  {rows.map((row, i) => (
                    <div key={`${guesses[i]?.name ?? i}`} className="arcade__guess">
                      <span className="arcade__guess-name">{guesses[i]?.name}</span>
                      {row.map((tile, j) => (
                        <span key={j} className={`arcade__tile arcade__tile--${tile}`} title={tile}>
                          {guesses[i]?.moves[j]}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {done ? (
              <Card data-testid="daily-opening-result">
                <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
                  {state.result === 'solved'
                    ? `Solved in ${state.guesses.length}`
                    : 'Not this time'}
                </h2>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>{answer.name}</strong> ({answer.eco}): {answer.moves.join(' ')}
                </p>
                {mode === 'daily' ? (
                  <div className="arcade__scoreline" style={{ justifyContent: 'flex-start' }}>
                    <Stat value={state.streak} label="Streak" />
                    <Stat value={state.bestStreak} label="Best streak" />
                    <Stat value={Object.keys(state.history).length} label="Days played" />
                  </div>
                ) : null}
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={() => void share()}>
                    Copy result
                  </Button>
                  <Button size="sm" variant="primary" onClick={startPractice}>
                    Practice a random opening
                  </Button>
                  {mode === 'practice' ? (
                    <Button size="sm" variant="ghost" onClick={() => setMode('daily')}>
                      Back to today’s
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
    </div>
  );
}
