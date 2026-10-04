import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board, type DrawShape } from '@/components/board/Board';
import { Badge, Button, Card, Stat, LinkButton } from '@/components/ui';
import { parseUci, uciToSan } from '@/chess/helpers';
import { San } from '@/chess/San';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { describeGame, type EvalPosition, quietPositions, sideToMove } from './positions';
import {
  describeRoundBest,
  describeScale,
  type Judgement,
  judge,
  pickRound,
  POINTS_PER_PAWN,
  ROUND_SIZE,
  SCALE_MAX,
  SCALE_STEP,
  SPOT_ON,
  streakBonus,
  summarizeRound,
} from './whoStandsBetter';
import '@/features/play/play.css';
import './arcade.css';

type Phase = 'intro' | 'guess' | 'reveal' | 'done';

export default function WhoStandsBetterPage() {
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade['who-stands-better']);
  const pool = useMemo(() => quietPositions(), []);
  const [round, setRound] = useState<EvalPosition[]>([]);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [judgements, setJudgements] = useState<Judgement[]>([]);
  /** The best score before this round (the store holds this round's the moment it ends). */
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const recordedRef = useRef(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  /** The rows whose first button takes the focus after a verdict and at the end. */
  const nextRowRef = useRef<HTMLDivElement>(null);
  const againRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Who Stands Better? · ${siteConfig.name}`;
  }, []);

  // The keyboard follows the round: the slider for a new position, the Next
  // button once the verdict is in, Play again at the end (the button pressed
  // before each of those has just disappeared).
  useEffect(() => {
    const firstButton = (row: HTMLDivElement | null) =>
      row?.querySelector<HTMLButtonElement>('button')?.focus();
    if (phase === 'guess') sliderRef.current?.focus();
    else if (phase === 'reveal') firstButton(nextRowRef.current);
    else if (phase === 'done') firstButton(againRowRef.current);
  }, [phase, index]);

  const begin = () => {
    setBestBefore(useProgress.getState().arcade['who-stands-better']?.best ?? null);
    setRound(pickRound(pool));
    setIndex(0);
    setGuess(0);
    setJudgements([]);
    setPhase('guess');
    recordedRef.current = false;
  };

  const position = round[index];
  const current = judgements[index];
  const streak = useMemo(() => {
    let n = 0;
    for (const j of judgements) n = j.verdict === 'spot on' || j.verdict === 'close' ? n + 1 : 0;
    return n;
  }, [judgements]);
  const summary = summarizeRound(judgements);

  const lockIn = () => {
    if (!position) return;
    setJudgements((list) => [...list, judge(guess, position.cp)]);
    setPhase('reveal');
  };

  const next = () => {
    if (index + 1 >= round.length) {
      setPhase('done');
      return;
    }
    setIndex(index + 1);
    setGuess(0);
    setPhase('guess');
  };

  useEffect(() => {
    if (phase !== 'done' || recordedRef.current) return;
    recordedRef.current = true;
    recordArcade(
      'who-stands-better',
      summary.score,
      `${summary.score} points · ${summary.spotOn} spot on of ${round.length}`,
    );
  }, [phase, summary.score, summary.spotOn, round.length, recordArcade]);

  const bestShape: DrawShape[] =
    phase === 'reveal' && position
      ? [
          {
            orig: parseUci(position.best).from,
            dest: parseUci(position.best).to,
            brush: 'paleBlue',
          },
        ]
      : [];
  const bestSan = position ? (uciToSan(position.fen, position.best) ?? position.best) : '';
  const toMove = position ? sideToMove(position) : 'white';

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Who Stands Better?
        </p>
        <h1>Who Stands Better?</h1>
        <p>
          Ten quiet positions from the classic games. Say who is better and by how much, then the
          engine shows the truth. Closeness scores points; calling the wrong side better scores
          nothing.
        </p>
      </div>

      {phase === 'intro' ? (
        <Card className="arcade__summary" style={{ margin: '0 auto' }}>
          <h2>Ready?</h2>
          <p className="muted">
            A round is {ROUND_SIZE} positions from a pool of {pool.length}, with White or Black to
            move. Say who is better and by how much: within {SPOT_ON} of a pawn is spot on, every
            pawn of error costs {POINTS_PER_PAWN} points, calling the wrong side better scores
            nothing, and a run of close calls earns a streak bonus.
          </p>
          {best ? <p className="small muted">Best: {best.detail}</p> : null}
          <div className="row">
            <Button variant="primary" size="lg" onClick={begin} data-testid="wsb-start">
              Start
            </Button>
          </div>
        </Card>
      ) : phase === 'done' ? (
        <Card className="arcade__summary" style={{ margin: '0 auto' }} data-testid="wsb-result">
          <h2>Round over</h2>
          <div className="arcade__scoreline">
            <Stat value={summary.score} label={`Points (max ${summary.max}+)`} />
            <Stat value={summary.spotOn} label="Spot on" />
            <Stat value={summary.wrongSide} label="Wrong side" />
          </div>
          <p className="muted" data-testid="wsb-best-line">
            {describeRoundBest(summary.score, bestBefore)}
          </p>
          <div className="row" ref={againRowRef}>
            <Button variant="primary" onClick={begin} data-testid="wsb-again">
              Play again
            </Button>
            <LinkButton to="/arcade">Arcade</LinkButton>
          </div>
        </Card>
      ) : position ? (
        <div className="trainer">
          <div className="play__boardcol">
            <div className="trainer__board">
              <Board
                fen={position.fen}
                orientation="white"
                viewOnly
                autoShapes={bestShape}
                ariaLabel={`Position ${index + 1}, ${toMove} to move`}
              />
            </div>
          </div>
          <aside className="trainer__panel stack">
            <Card>
              <div className="row row--between">
                <strong data-testid="wsb-progress">
                  Position {index + 1} of {round.length}
                </strong>
                <Badge tone={toMove === 'white' ? 'neutral' : 'info'}>
                  <span
                    className={`arcade__to-move arcade__to-move--${toMove}`}
                    aria-hidden="true"
                  />
                  <span data-testid="wsb-to-move">
                    {toMove === 'white' ? 'White' : 'Black'} to move
                  </span>
                </Badge>
              </div>
              <p className="small muted" style={{ margin: '4px 0 12px' }}>
                {describeGame(position)} · move {Math.ceil(position.ply / 2)}
              </p>
              <label className="small" htmlFor="wsb-slider">
                Your judgement: <strong data-testid="wsb-guess">{describeScale(guess)}</strong>
              </label>
              <input
                id="wsb-slider"
                ref={sliderRef}
                className="arcade__slider"
                type="range"
                min={-SCALE_MAX}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={guess}
                aria-valuetext={describeScale(guess)}
                onChange={(e) => setGuess(Number(e.target.value))}
                disabled={phase === 'reveal'}
                data-testid="wsb-slider"
              />
              <div className="arcade__slider-labels" aria-hidden="true">
                <span>Black winning</span>
                <span>Equal</span>
                <span>White winning</span>
              </div>
              {phase === 'guess' ? (
                <div className="row" style={{ marginTop: 12 }}>
                  <Button variant="primary" onClick={lockIn} data-testid="wsb-lock">
                    Lock in
                  </Button>
                </div>
              ) : current ? (
                <div data-testid="wsb-reveal" role="status">
                  <p className="arcade__verdict">
                    {current.verdict.charAt(0).toUpperCase() + current.verdict.slice(1)} ·{' '}
                    {current.points}
                    {streakBonus(streak) > 0 ? ` + ${streakBonus(streak)} streak` : ''} points
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    The engine says: <strong>{describeScale(current.truth)}</strong> — its move
                    would be{' '}
                    <strong>
                      <San san={bestSan} />
                    </strong>
                    .
                  </p>
                </div>
              ) : null}
              {phase === 'reveal' ? (
                <div className="row" style={{ marginTop: 12 }} ref={nextRowRef}>
                  <Button variant="primary" onClick={next} data-testid="wsb-next">
                    {index + 1 >= round.length ? 'See the score' : 'Next position'}
                  </Button>
                  <LinkButton size="sm" to={`/analyze?fen=${encodeURIComponent(position.fen)}`}>
                    Analyze position
                  </LinkButton>
                </div>
              ) : null}
            </Card>
            <Card>
              <div className="row row--between">
                <span className="small muted">Score so far</span>
                <strong data-testid="wsb-score">{summary.score}</strong>
              </div>
              {streak >= 2 ? (
                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  Streak: {streak} close calls in a row.
                </p>
              ) : null}
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
