import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board, type DrawShape } from '@/components/board/Board';
import { Badge, Button, Card, Stat, LinkButton } from '@/components/ui';
import { parseUci, uciToSan } from '@/chess/helpers';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { describeGame, type EvalPosition, quietPositions, sideToMove } from './positions';
import {
  describeScale,
  type Judgement,
  judge,
  pickRound,
  ROUND_SIZE,
  SCALE_MAX,
  SCALE_STEP,
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
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Who Stands Better? · ${siteConfig.name}`;
  }, []);

  const begin = () => {
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
            A round is {ROUND_SIZE} positions from a pool of {pool.length}. Say who is better and by
            how much: closeness scores points, calling the wrong side better scores nothing, and a
            run of close calls earns a streak bonus.
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
          <p className="muted">
            {best && best.best > summary.score
              ? `Your best is ${best.best}.`
              : 'A new best — or your first round.'}
          </p>
          <div className="row">
            <Button variant="primary" onClick={begin}>
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
                ariaLabel={`Position ${index + 1}, ${sideToMove(position)} to move`}
              />
            </div>
          </div>
          <aside className="trainer__panel stack">
            <Card>
              <div className="row row--between">
                <strong data-testid="wsb-progress">
                  Position {index + 1} of {round.length}
                </strong>
                <Badge>{sideToMove(position) === 'white' ? 'White' : 'Black'} to move</Badge>
              </div>
              <p className="small muted" style={{ margin: '4px 0 12px' }}>
                {describeGame(position)} · move {Math.ceil(position.ply / 2)}
              </p>
              <label className="small" htmlFor="wsb-slider">
                Your judgement: <strong data-testid="wsb-guess">{describeScale(guess)}</strong>
              </label>
              <input
                id="wsb-slider"
                className="arcade__slider"
                type="range"
                min={-SCALE_MAX}
                max={SCALE_MAX}
                step={SCALE_STEP}
                value={guess}
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
                <div data-testid="wsb-reveal">
                  <p className="arcade__verdict">
                    {current.verdict.charAt(0).toUpperCase() + current.verdict.slice(1)} ·{' '}
                    {current.points}
                    {streakBonus(streak) > 0 ? ` + ${streakBonus(streak)} streak` : ''} points
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    The engine says: <strong>{describeScale(current.truth)}</strong> — its move
                    would be <strong>{bestSan}</strong>.
                  </p>
                  <div className="row" style={{ marginTop: 12 }}>
                    <Button variant="primary" onClick={next} data-testid="wsb-next">
                      {index + 1 >= round.length ? 'See the score' : 'Next position'}
                    </Button>
                    <LinkButton size="sm" to={`/analyze?fen=${encodeURIComponent(position.fen)}`}>
                      Analyze
                    </LinkButton>
                  </div>
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
