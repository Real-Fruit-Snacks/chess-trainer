import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Segmented,
  Spinner,
  Stat,
  LinkButton,
} from '@/components/ui';
import { START_FEN } from '@/chess/helpers';
import { Notated, San } from '@/chess/San';
import { useChess } from '@/chess/useChess';
import { playSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { movesToPgn } from './dailyOpening';
import {
  carryLine,
  describeEngineSays,
  type Pace,
  pickSequenceLine,
  pliesForRound,
  scoreAfterRound,
  sequenceLines,
  SHOW_END_PAUSE_MS,
  SHOW_STEP_MS,
} from './engineSays';
import { loadOpeningLines, type OpeningLine } from './openingLines';
import '@/features/play/play.css';
import './arcade.css';

type Phase = 'idle' | 'showing' | 'replay' | 'over';

export default function EngineSaysPage() {
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade['engine-says']);
  const [lines, setLines] = useState<OpeningLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [line, setLine] = useState<OpeningLine | null>(null);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0);
  const [score, setScore] = useState(0);
  /** Moves of the lines already replayed in full this run: they stay in the score. */
  const [carried, setCarried] = useState(0);
  const [pace, setPace] = useState<Pace>('normal');
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const game = useChess(START_FEN, { autoQueen: true });
  const timer = useRef<number | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Engine Says · ${siteConfig.name}`;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOpeningLines()
      .then((loaded) => {
        if (!cancelled) setLines(sequenceLines(loaded));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const target = line ? Math.min(pliesForRound(round), line.moves.length) : 0;
  const sequence = useMemo(() => (line ? line.moves.slice(0, target) : []), [line, target]);

  /** The position after the first `shown` moves of the sequence, and the last of them. */
  const showing = useMemo(() => {
    const chess = new Chess();
    let lastMove: [Square, Square] | null = null;
    for (const san of sequence.slice(0, shown)) {
      try {
        const move = chess.move(san);
        lastMove = [move.from, move.to];
      } catch {
        break;
      }
    }
    return { fen: chess.fen(), lastMove };
  }, [sequence, shown]);

  const showSequence = useCallback(() => {
    setPhase('showing');
    setShown(0);
    let i = 0;
    // The pace is read at every step, so a change applies straight away.
    const step = () => {
      i += 1;
      setShown(i);
      if (i < sequence.length) {
        timer.current = window.setTimeout(step, SHOW_STEP_MS[paceRef.current]);
      } else {
        timer.current = window.setTimeout(() => {
          game.reset(START_FEN);
          setPhase('replay');
        }, SHOW_STEP_MS[paceRef.current] + SHOW_END_PAUSE_MS);
      }
    };
    timer.current = window.setTimeout(step, SHOW_STEP_MS[paceRef.current]);
  }, [sequence, game]);

  /** A new run, at the chosen pace (Play again keeps it). */
  const begin = () => {
    if (!lines?.length) return;
    const next = pickSequenceLine(lines);
    if (!next) return;
    if (timer.current) window.clearTimeout(timer.current);
    recordedRef.current = false;
    setLine(next);
    setRound(1);
    setScore(0);
    setCarried(0);
    setShown(0);
    setPhase('showing');
  };

  // Whenever a round starts, show its sequence.
  useEffect(() => {
    if (phase !== 'showing' || shown !== 0 || sequence.length === 0) return;
    showSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per round
  }, [phase, sequence.length, line]);

  const { position } = game;
  const replayed = position.history.length;

  const finish = (finalScore: number) => {
    setScore(finalScore);
    setPhase('over');
  };

  const onMove = (from: string, to: string) => {
    if (phase !== 'replay' || !line) return;
    const expected = sequence[replayed];
    const probe = new Chess(position.fen);
    let played: string;
    try {
      played = probe.move({ from, to, promotion: 'q' }).san;
    } catch {
      return;
    }
    if (played !== expected) {
      playSound('failed');
      finish(scoreAfterRound(round, carried));
      return;
    }
    game.playNotation(played);
    if (replayed + 1 < sequence.length) return;
    playSound('solved');
    if (sequence.length >= line.moves.length) {
      // The whole line replayed: its moves are banked, and a fresh line starts at round one.
      const total = carryLine(carried, sequence.length);
      setCarried(total);
      setScore(total);
      const next = lines ? pickSequenceLine(lines.filter((l) => l.name !== line.name)) : null;
      if (!next) {
        finish(total);
        return;
      }
      setLine(next);
      setRound(1);
      setShown(0);
      setPhase('showing');
      return;
    }
    setScore(carried + pliesForRound(round));
    setRound((r) => r + 1);
    setShown(0);
    setPhase('showing');
  };

  useEffect(() => {
    if (phase !== 'over' || recordedRef.current) return;
    recordedRef.current = true;
    recordArcade('engine-says', score, describeEngineSays(score));
  }, [phase, score, recordArcade]);

  const boardFen = phase === 'showing' ? showing.fen : position.fen;
  const lastMove = phase === 'showing' ? showing.lastMove : position.lastMove;
  const playerTurn = phase === 'replay';
  const shownSan = phase === 'showing' && shown > 0 ? sequence[shown - 1] : undefined;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Engine Says
        </p>
        <h1>Engine Says</h1>
        <p>
          Watch the engine play a few moves of a real opening line, then replay them from memory —
          both sides. Every round adds a move.
        </p>
      </div>

      {loadError ? (
        <Alert tone="danger">The opening book could not be loaded: {loadError}</Alert>
      ) : null}
      {!lines && !loadError ? <Spinner label="Loading the opening book" /> : null}

      <div className="trainer">
        <div className="play__boardcol">
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={boardFen}
              orientation="white"
              viewOnly={!playerTurn}
              movableColor={playerTurn ? 'both' : undefined}
              dests={playerTurn ? position.dests : new Map()}
              lastMove={lastMove}
              onMove={onMove}
              animate
              // While the engine shows the line, the status line names each move.
              announceMoves={phase !== 'showing'}
              ariaLabel={`Engine Says board, ${phase === 'showing' ? 'watch' : 'replay'}`}
            />
            {phase === 'idle' || phase === 'over' ? (
              <div className="trainer__overlay">
                <Card className="arcade__summary" data-testid="engine-says-card">
                  <h2>{phase === 'over' ? 'Run over' : 'Engine Says'}</h2>
                  {phase === 'over' ? (
                    <div className="arcade__scoreline">
                      <Stat value={score} label="Moves replayed" />
                      <Stat value={best ? Math.max(best.best, score) : score} label="Best" />
                    </div>
                  ) : (
                    <p className="muted">
                      Round one shows three moves. Replay them in order and the next round adds one
                      more; replay a whole line and a new one starts, with your moves kept.{' '}
                      {best ? `Best so far: ${best.best}.` : ''}
                    </p>
                  )}
                  {phase === 'over' && line ? (
                    <p className="small muted">
                      The line was <strong>{line.name}</strong>:{' '}
                      <Notated text={movesToPgn(line.moves)} />
                    </p>
                  ) : null}
                  <div className="row">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={begin}
                      disabled={!lines?.length}
                      data-testid="engine-says-start"
                    >
                      {phase === 'over' ? 'Play again' : 'Start'}
                    </Button>
                    <LinkButton to="/arcade">Arcade</LinkButton>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>
                {phase === 'showing'
                  ? 'Watch…'
                  : phase === 'replay'
                    ? 'Your turn: replay the moves'
                    : 'Engine Says'}
              </strong>
              {line ? <Badge>Round {round}</Badge> : null}
            </div>
            <p className="arcade__status" role="status" data-testid="engine-says-status">
              {phase === 'showing' ? (
                <>
                  Move {Math.min(shown, sequence.length)} of {sequence.length}
                  {shownSan ? (
                    <>
                      : <San san={shownSan} />
                    </>
                  ) : null}
                </>
              ) : phase === 'replay' ? (
                `${replayed} of ${sequence.length} replayed`
              ) : (
                ''
              )}
            </p>
            {phase === 'replay' || phase === 'showing' ? (
              <ol
                className="arcade__sequence"
                role="list"
                aria-label="The sequence"
                data-testid="engine-says-sequence"
              >
                {sequence.map((san, i) => {
                  const revealed = phase === 'showing' ? i < shown : i < replayed;
                  const current = phase === 'replay' && i === replayed;
                  return (
                    <li
                      key={`${i}-${san}`}
                      className={`arcade__sequence-move${
                        revealed ? ' arcade__sequence-move--done' : ''
                      }${current ? ' arcade__sequence-move--current' : ''}`}
                      data-san={revealed ? san : undefined}
                      aria-current={current ? 'step' : undefined}
                    >
                      {revealed ? (
                        <San san={san} />
                      ) : (
                        <>
                          <span aria-hidden="true">?</span>
                          <span className="sr-only">Move {i + 1}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Score: <strong data-testid="engine-says-score">{score}</strong>
              {carried > 0 ? ` (${carried} from finished lines)` : ''}
              {best ? ` · best ${best.best}` : ''}
            </p>
            <div style={{ marginTop: 12 }}>
              <Field label="Pace">
                {() => (
                  <Segmented<Pace>
                    ariaLabel="Pace"
                    value={pace}
                    onChange={setPace}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'slow', label: 'Slow' },
                    ]}
                  />
                )}
              </Field>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
