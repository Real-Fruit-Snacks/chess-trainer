import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { Board, type DrawShape, type Key } from '@/components/board/Board';
import { knightSquares } from '@/chess/geometry';
import { Badge, Button, Card, Field, Icon, LinkButton, Segmented, Stat } from '@/components/ui';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import {
  HUNTS,
  type HuntMode,
  huntFen,
  huntMessage,
  hunterDests,
  movesToSighting,
  squadFen,
} from './ghostKnight';
import { LIVES, useGhostKnight } from './useGhostKnight';
import { useStackedLayout } from './useStackedLayout';
import '@/features/play/play.css';
import './arcade.css';

/** The lives left, as marks with their count in words. */
function Lives({ left }: { left: number }) {
  return (
    <span className="ghost__lives" data-testid="ghost-lives">
      <span aria-hidden="true" className="ghost__life-marks">
        {Array.from({ length: LIVES }, (_, i) => (
          <span key={i} className={`ghost__life${i < left ? ' ghost__life--left' : ''}`} />
        ))}
      </span>
      <span>
        {left} {left === 1 ? 'life' : 'lives'}
      </span>
    </span>
  );
}

/** "c3, e3 and f4". */
function listSquares(squares: readonly string[]): string {
  if (squares.length <= 1) return squares.join('');
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}

export default function GhostKnightPage() {
  const best = useProgress((s) => s.arcade['ghost-knight']);
  const ghost = useGhostKnight();
  const stacked = useStackedLayout();
  const nextRef = useRef<HTMLButtonElement>(null);
  const { phase, mode, hunt, huntIndex, lives, points, caught, lastPoints } = ghost;
  const hunting = phase === 'hunting';
  const running = phase === 'hunting' || phase === 'ended';
  const squad = hunt?.squad ?? HUNTS[huntIndex];

  useEffect(() => {
    document.title = `Ghost Knight · ${siteConfig.name}`;
  }, []);

  // Enter goes on once a hunt is over (the button answers it itself when focused).
  const { next } = ghost;
  useEffect(() => {
    if (phase !== 'ended') return;
    const onKey = (e: KeyboardEvent) => {
      if (pageShortcutKey(e) !== 'Enter') return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, next]);

  // When a hunt ends, the keyboard moves to what comes next.
  useEffect(() => {
    if (phase !== 'ended') return;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('.board')) nextRef.current?.focus();
  }, [phase]);

  const dests = useMemo(
    () => (hunt && hunting ? hunterDests(hunt.hunters) : new Map()),
    [hunt, hunting],
  );

  const highlights = useMemo(() => {
    const map = new Map<Key, string>();
    if (!hunt || !hunting || hunt.shown) return map;
    if (mode === 'shaded') for (const square of hunt.possible) map.set(square, 'ghost-maybe');
    map.set(hunt.lastSeen, map.has(hunt.lastSeen) ? 'ghost-maybe ghost-last' : 'ghost-last');
    return map;
  }, [hunt, hunting, mode]);

  // Cornered: every square the knight could jump to, marked to show it was covered.
  const shapes = useMemo<DrawShape[]>(
    () =>
      hunt?.outcome === 'cornered' && hunt.shown
        ? knightSquares(hunt.shown).map((orig) => ({ orig, brush: 'red' }))
        : [],
    [hunt],
  );

  const won = hunt?.outcome === 'caught' || hunt?.outcome === 'cornered';
  const spare = hunt ? Math.max(0, hunt.squad.budget - hunt.turn) : 0;
  const lastHunt = huntIndex + 1 >= HUNTS.length;
  const endedCard =
    phase === 'ended' && hunt ? (
      <Card className="ghost__ended" data-testid="ghost-ended">
        <h2 className="ghost__ended-title">
          {won ? (
            <>
              <Icon name="check" size={22} /> {hunt.outcome === 'cornered' ? 'Cornered' : 'Caught'}{' '}
              in {hunt.turn} move
              {hunt.turn === 1 ? '' : 's'}
            </>
          ) : (
            <>
              <Icon name="close" size={22} /> It got away
            </>
          )}
        </h2>
        <p className="small" style={{ margin: 0 }}>
          {won
            ? `${lastPoints} points: 10 for the catch${spare ? ` and ${spare} for the move${spare === 1 ? '' : 's'} to spare` : ''}${mode === 'unshaded' ? ', doubled for hunting unshaded' : ''}.`
            : lives > 0
              ? `A life lost: ${lives} left. The same squad tries again, with the knight somewhere new.`
              : 'That was the last life.'}
        </p>
        <Button
          ref={nextRef}
          variant="primary"
          onClick={next}
          aria-keyshortcuts="Enter"
          data-testid="ghost-next"
        >
          {won
            ? lastHunt
              ? 'See the result'
              : 'Next hunt'
            : lives > 0
              ? 'Try again'
              : 'See the result'}
        </Button>
      </Card>
    ) : null;

  const left = hunt ? movesToSighting(hunt) : 0;
  const whereabouts =
    hunt && hunting ? (
      hunt.shown ? (
        <p className="small" style={{ margin: 0 }} data-testid="ghost-whereabouts">
          In sight on <strong>{hunt.shown}</strong> — it vanishes when it moves.
        </p>
      ) : (
        <p className="small" style={{ margin: 0 }} data-testid="ghost-whereabouts">
          Last seen on <strong>{hunt.lastSeen}</strong>; seen again in {left} move
          {left === 1 ? '' : 's'}.
          {mode === 'shaded'
            ? ` It could be on ${hunt.possible.length} square${hunt.possible.length === 1 ? '' : 's'}${hunt.possible.length <= 8 ? `: ${listSquares(hunt.possible)}` : ''}.`
            : null}
        </p>
      )
    ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Ghost Knight
        </p>
        <h1>Ghost Knight</h1>
        <p>
          An enemy knight hides on the board and shows itself every third move. Corner it with your
          squad before your moves run out.
        </p>
      </div>

      <div className="trainer">
        <div className="play__boardcol">
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={hunt ? huntFen(hunt) : squad ? squadFen(squad) : '8/8/8/8/8/8/8/8 w - - 0 1'}
              orientation="white"
              turnColor="white"
              viewOnly={!hunting}
              movableColor={hunting ? 'white' : undefined}
              dests={dests}
              lastMove={hunt?.lastMove ?? null}
              highlights={highlights}
              autoShapes={shapes}
              onMove={(from, to) => {
                ghost.move(from, to);
              }}
              announceMoves={false}
              drawable={false}
              className="ghost-board"
              ariaLabel="Ghost Knight board, your hunters"
            />
            {phase === 'idle' || phase === 'over' ? (
              <div className="trainer__overlay">
                <Card className="arcade__summary" data-testid="ghost-card">
                  <h2>{phase === 'over' ? 'Run over' : 'Ghost Knight'}</h2>
                  {phase === 'over' ? (
                    <div className="arcade__scoreline">
                      <Stat value={`${caught} of ${HUNTS.length}`} label="Hunts" />
                      <Stat value={points} label="Points" />
                      <Stat value={best ? Math.max(best.best, points) : points} label="Best" />
                    </div>
                  ) : (
                    <p className="muted">
                      Your pieces move as always, one move a turn. The knight moves too, unseen: it
                      never jumps onto a square you attack, and it takes any piece you leave
                      unprotected within its reach. Catch it by landing on it, or corner it so every
                      square it could jump to is covered. Five hunts, three lives.{' '}
                      {best ? `Best so far: ${best.best} points.` : ''}
                    </p>
                  )}
                  <div className="row">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={ghost.start}
                      data-testid="ghost-start"
                    >
                      {phase === 'over' ? 'Play again' : 'Start'}
                    </Button>
                    <LinkButton to="/arcade">Arcade</LinkButton>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
          {stacked && endedCard ? <div className="arcade__calls-under">{endedCard}</div> : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>{running && squad ? squad.name : 'Ghost Knight'}</strong>
              {running ? (
                <Badge>
                  Hunt {huntIndex + 1} of {HUNTS.length}
                </Badge>
              ) : null}
            </div>
            <p className="arcade__status" role="status" data-testid="ghost-status">
              {hunt && running ? huntMessage(hunt) : ''}
            </p>
            {whereabouts}
            <div className="row row--between ghost__tally">
              {hunt && running ? (
                <span data-testid="ghost-moves">
                  Move <strong>{hunt.turn}</strong> of {hunt.squad.budget}
                </span>
              ) : null}
              <span data-testid="ghost-points">
                Points: <strong>{points}</strong>
                {best ? <span className="muted"> · best {best.best}</span> : null}
              </span>
              {running ? <Lives left={lives} /> : null}
            </div>
            {!running ? (
              <div style={{ marginTop: 12 }}>
                <Field
                  label="Mode"
                  hint={
                    mode === 'shaded'
                      ? 'The board shades every square the knight could be on.'
                      : 'No shading: you track the knight yourself, for double points.'
                  }
                >
                  {() => (
                    <Segmented<HuntMode>
                      ariaLabel="Mode"
                      value={mode}
                      onChange={ghost.setMode}
                      options={[
                        { value: 'shaded', label: 'Shaded' },
                        { value: 'unshaded', label: 'Unshaded' },
                      ]}
                    />
                  )}
                </Field>
              </div>
            ) : null}
          </Card>
          {!stacked ? endedCard : null}
        </aside>
      </div>
    </div>
  );
}
