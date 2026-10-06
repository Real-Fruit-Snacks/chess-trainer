import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board, type DrawShape } from '@/components/board/Board';
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Kbd,
  LinkButton,
  Segmented,
  Spinner,
  Stat,
} from '@/components/ui';
import { San } from '@/chess/San';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { type ArbiterPace, formatSeconds, type ReplayGame, replayGame, STRIKES } from './arbiter';
import { KIND_TITLES } from './arbiterMoves';
import { useArbiter } from './useArbiter';
import { useStackedLayout } from '@/lib/useStackedLayout';
import '@/features/play/play.css';
import './arcade.css';

/** Three marks for the strikes: filled when used. */
function Strikes({ used }: { used: number }) {
  return (
    <span className="arbiter__strikes" data-testid="arbiter-strikes">
      <span aria-hidden="true" className="arbiter__strike-marks">
        {Array.from({ length: STRIKES }, (_, i) => (
          <span key={i} className={`arbiter__strike${i < used ? ' arbiter__strike--used' : ''}`} />
        ))}
      </span>
      <span>
        {used} of {STRIKES} strikes
      </span>
    </span>
  );
}

export default function ArbiterPage() {
  const best = useProgress((s) => s.arcade.arbiter);
  const [games, setGames] = useState<ReplayGame[] | null>(null);
  const [pace, setPace] = useState<ArbiterPace>('normal');
  const arbiter = useArbiter(games, pace);
  const stacked = useStackedLayout();
  const callRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const { phase, round, strikes, caught, fastestMs, current, verdict, falseAlarm, paused, move } =
    arbiter;
  const running = phase === 'watching' || phase === 'verdict';

  useEffect(() => {
    document.title = `Arbiter · ${siteConfig.name}`;
  }, []);

  // Forty-odd classic games read move by move: done once, after the first paint.
  useEffect(() => {
    const id = window.setTimeout(() => setGames(CLASSIC_GAMES.map(replayGame)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Space calls the move; Enter goes on after a verdict (buttons answer both keys themselves).
  const { call, next } = arbiter;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = pageShortcutKey(e);
      if (key === ' ' && phase === 'watching') {
        e.preventDefault();
        call();
      } else if (key === 'Enter' && phase === 'verdict') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, call, next]);

  // The keyboard follows the run: to "Next round" at a verdict, back to the call after it.
  const previousPhase = useRef(phase);
  useEffect(() => {
    const before = previousPhase.current;
    previousPhase.current = phase;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (phase === 'verdict' && before === 'watching' && (lost || active === callRef.current)) {
      nextRef.current?.focus();
    } else if (
      phase === 'watching' &&
      before === 'verdict' &&
      (lost || active === nextRef.current)
    ) {
      callRef.current?.focus();
    }
  }, [phase]);

  const illegal = current?.illegal ?? null;
  const showReason = phase === 'verdict' && verdict?.outcome !== 'false-alarm' && illegal;
  const shapes = useMemo<DrawShape[]>(() => {
    if (!showReason || !illegal) return [];
    return [
      ...illegal.arrows.map(([orig, dest]) => ({ orig, dest, brush: 'red' })),
      ...illegal.marks.map((orig) => ({ orig, brush: 'red' })),
      ...illegal.hints.map((orig) => ({ orig, brush: 'green' })),
    ];
  }, [showReason, illegal]);

  const verdictCard =
    phase === 'verdict' && verdict ? (
      <Card className="arbiter__verdict" data-testid="arbiter-verdict">
        {verdict.outcome === 'false-alarm' ? (
          <>
            <h2 className="arbiter__verdict-title">That move was legal</h2>
            <p>
              {verdict.called?.label}
              <San san={verdict.called?.san ?? ''} /> broke no rule, and that was the third strike.
            </p>
          </>
        ) : (
          <>
            <h2 className="arbiter__verdict-title">
              {verdict.outcome === 'caught' ? (
                <>
                  <Icon name="check" size={22} /> Caught in {formatSeconds(verdict.reactionMs ?? 0)}
                </>
              ) : (
                <>
                  <Icon name="close" size={22} /> Missed
                </>
              )}
            </h2>
            {illegal ? (
              <>
                <p className="arbiter__verdict-kind">
                  {KIND_TITLES[illegal.kind]}: <San san={illegal.san} />
                </p>
                <p className="small" data-testid="arbiter-reason">
                  {illegal.reason}
                </p>
              </>
            ) : null}
          </>
        )}
        <Button
          ref={nextRef}
          variant="primary"
          onClick={next}
          aria-keyshortcuts="Enter"
          data-testid="arbiter-next"
        >
          {strikes >= STRIKES ? 'See the result' : 'Next round'}
        </Button>
      </Card>
    ) : null;

  const callButton =
    phase === 'watching' ? (
      <div className="stack arbiter__controls">
        <Button
          ref={callRef}
          variant="danger"
          size="lg"
          block
          className="arbiter__call"
          onClick={call}
          disabled={paused}
          aria-keyshortcuts="Space"
          data-testid="arbiter-call"
        >
          <Icon name="whistle" size={24} /> Illegal!
          <Kbd>
            <span aria-hidden="true">Space</span>
          </Kbd>
        </Button>
        {falseAlarm ? (
          <p className="arbiter__false-alarm" data-testid="arbiter-false-alarm">
            {falseAlarm.label}
            <San san={falseAlarm.san} /> was legal — a strike.
          </p>
        ) : null}
      </div>
    ) : null;

  const underBoard = (
    <>
      {callButton}
      {verdictCard}
    </>
  );

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Arbiter
        </p>
        <h1>Arbiter</h1>
        <p>
          Classic games replay at speed, and in every round one move breaks the rules. Call it
          before the next move comes.
        </p>
      </div>

      <div className="trainer">
        <div className="play__boardcol">
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={arbiter.fen}
              orientation="white"
              viewOnly
              lastMove={arbiter.lastMove}
              check={phase === 'watching' && !!move && /[+#]$/.test(move.san)}
              autoShapes={shapes}
              animate
              announceMoves={false}
              ariaLabel="Arbiter board"
            />
            {paused ? (
              <div className="trainer__overlay arbiter__paused">
                <Card className="arcade__summary" data-testid="arbiter-paused">
                  <h2>Paused</h2>
                  <p className="muted">
                    The board is hidden while the replay waits, so a pause is never a look.
                  </p>
                  <Button variant="primary" onClick={arbiter.resume} data-testid="arbiter-resume">
                    Resume
                  </Button>
                </Card>
              </div>
            ) : null}
            {phase === 'idle' || phase === 'over' ? (
              <div className="trainer__overlay">
                <Card className="arcade__summary" data-testid="arbiter-card">
                  <h2>{phase === 'over' ? 'Run over' : 'Arbiter'}</h2>
                  {phase === 'over' ? (
                    <div className="arcade__scoreline">
                      <Stat value={caught} label="Caught" />
                      <Stat value={best ? Math.max(best.best, caught) : caught} label="Best" />
                      {fastestMs !== null ? (
                        <Stat value={formatSeconds(fastestMs)} label="Fastest call" />
                      ) : null}
                    </div>
                  ) : (
                    <p className="muted">
                      Every round shows a few real moves, then one illegal one: a knight off its L,
                      a pawn going backwards, a pinned piece moving, castling through check. Call it
                      with the button or Space before the next move would come. Calling a legal move
                      or letting the illegal one pass is a strike; three end the run.{' '}
                      {best ? `Best so far: ${best.best}.` : ''}
                    </p>
                  )}
                  <div className="row">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={arbiter.start}
                      disabled={!games}
                      data-testid="arbiter-start"
                    >
                      {phase === 'over' ? 'Play again' : 'Start'}
                    </Button>
                    <LinkButton to="/arcade">Arcade</LinkButton>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
          {stacked ? <div className="arcade__calls-under">{underBoard}</div> : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{running && current ? current.title : 'Arbiter'}</strong>
              {running ? <Badge>Round {round}</Badge> : null}
            </div>
            {running && current ? <p className="small muted">{current.caption}</p> : null}
            <p
              className={`arcade__status${running ? '' : ' arcade__status--idle'}`}
              role="status"
              data-testid="arbiter-status"
            >
              {phase === 'watching' && paused ? (
                'Paused'
              ) : move && running ? (
                <>
                  {move.label}
                  <San san={move.san} />
                </>
              ) : phase === 'watching' ? (
                'Watch the board…'
              ) : null}
            </p>
            <div className="row row--between arbiter__tally">
              <span data-testid="arbiter-caught">
                Caught: <strong>{caught}</strong>
                {best ? <span className="muted"> · best {best.best}</span> : null}
              </span>
              <Strikes used={strikes} />
            </div>
            {phase === 'watching' ? (
              <div className="row" style={{ marginTop: 12 }}>
                <Button size="sm" onClick={arbiter.pause} disabled={paused}>
                  Pause
                </Button>
              </div>
            ) : null}
            {!running ? (
              <div style={{ marginTop: 12 }}>
                <Field
                  label="Pace"
                  hint="Slow gives every move nearly twice as long, and speeds up more gently."
                >
                  {() => (
                    <Segmented<ArbiterPace>
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
            ) : null}
          </Card>
          {!stacked ? underBoard : null}
          {!games ? <Spinner label="Reading the classic games" /> : null}
        </aside>
      </div>
    </div>
  );
}
