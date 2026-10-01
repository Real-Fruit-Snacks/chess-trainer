import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { Alert, Badge, Button, Card, Spinner, Stat, LinkButton } from '@/components/ui';
import { START_FEN } from '@/chess/helpers';
import { useChess } from '@/chess/useChess';
import { playSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import {
  describeEngineSays,
  pickSequenceLine,
  pliesForRound,
  scoreAfterRound,
  sequenceLines,
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

  /** The position after the first `n` moves of the sequence (for the showing phase). */
  const shownFen = useMemo(() => {
    const chess = new Chess();
    for (const san of sequence.slice(0, shown)) {
      try {
        chess.move(san);
      } catch {
        break;
      }
    }
    return chess.fen();
  }, [sequence, shown]);

  const showSequence = useCallback(() => {
    setPhase('showing');
    setShown(0);
    let i = 0;
    const step = () => {
      i += 1;
      setShown(i);
      if (i < sequence.length) {
        timer.current = window.setTimeout(step, SHOW_STEP_MS);
      } else {
        timer.current = window.setTimeout(() => {
          game.reset(START_FEN);
          setPhase('replay');
        }, SHOW_STEP_MS + 300);
      }
    };
    timer.current = window.setTimeout(step, SHOW_STEP_MS);
  }, [sequence, game]);

  const begin = () => {
    if (!lines?.length) return;
    const next = pickSequenceLine(lines);
    if (!next) return;
    recordedRef.current = false;
    setLine(next);
    setRound(1);
    setScore(0);
    setShown(0);
    setPhase('showing');
  };

  // Whenever a round starts, show its sequence.
  useEffect(() => {
    if (phase !== 'showing' || shown !== 0 || sequence.length === 0) return;
    showSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per round
  }, [phase, sequence.length]);

  const { position } = game;
  const replayed = position.history.length;

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
      finish(scoreAfterRound(round));
      return;
    }
    game.playNotation(played);
    if (replayed + 1 >= sequence.length) {
      playSound('solved');
      if (sequence.length >= line.moves.length) {
        // The whole line replayed: carry on with a fresh one, keeping the score.
        const next = lines ? pickSequenceLine(lines.filter((l) => l.name !== line.name)) : null;
        setScore(sequence.length);
        if (!next) {
          finish(sequence.length);
          return;
        }
        setLine(next);
        setRound(1);
        setShown(0);
        setPhase('showing');
        return;
      }
      setScore(pliesForRound(round));
      setRound((r) => r + 1);
      setShown(0);
      setPhase('showing');
    }
  };

  const finish = (finalScore: number) => {
    setScore(finalScore);
    setPhase('over');
  };

  useEffect(() => {
    if (phase !== 'over' || recordedRef.current) return;
    recordedRef.current = true;
    recordArcade('engine-says', score, describeEngineSays(score));
  }, [phase, score, recordArcade]);

  const boardFen = phase === 'showing' ? shownFen : position.fen;
  const playerTurn = phase === 'replay';

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
              lastMove={phase === 'showing' ? null : position.lastMove}
              onMove={onMove}
              animate
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
                      more. {best ? `Best so far: ${best.best}.` : ''}
                    </p>
                  )}
                  {phase === 'over' && line ? (
                    <p className="small muted">
                      The line was <strong>{line.name}</strong>: {line.moves.join(' ')}
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
              {phase === 'showing'
                ? `Move ${Math.min(shown, sequence.length)} of ${sequence.length}`
                : phase === 'replay'
                  ? `${replayed} of ${sequence.length} replayed`
                  : ''}
            </p>
            {phase === 'replay' || phase === 'showing' ? (
              <div
                className="arcade__sequence"
                aria-hidden="true"
                data-testid="engine-says-sequence"
              >
                {sequence.map((san, i) => {
                  const revealed = phase === 'showing' ? i < shown : i < replayed;
                  const current = phase === 'replay' && i === replayed;
                  return (
                    <span
                      key={`${i}-${san}`}
                      className={`arcade__sequence-move${
                        revealed ? ' arcade__sequence-move--done' : ''
                      }${current ? ' arcade__sequence-move--current' : ''}`}
                    >
                      {phase === 'showing' && i < shown
                        ? san
                        : phase === 'replay' && i < replayed
                          ? san
                          : '?'}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Score: <strong data-testid="engine-says-score">{score}</strong>
              {best ? ` · best ${best.best}` : ''}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
