import { Chess } from 'chess.js';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { legalDests } from '@/chess/helpers';
import { Notated, San } from '@/chess/San';
import { Board, type DrawShape } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveInput } from '@/components/chess/MoveInput';
import { Alert, Badge, Button, Card, Kbd, Spinner, Stat } from '@/components/ui';
import { safeSourceUrl } from '@/lib/gameImport';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { themeName } from '@/features/puzzles/themes';
import {
  THREAT_TRIES,
  arrowOf,
  defencesInSan,
  gameMoveSan,
  useThreatDrill,
} from './useThreatDrill';
import './drills.css';

const NAME = { white: 'White', black: 'Black' } as const;

export default function ThreatDrillPage() {
  const drill = useThreatDrill();
  const stats = useProgress((s) => s.threatStats);
  const ownCount = useProgress((s) => Object.keys(s.ownThreats).length);
  const moveInput = useSettings((s) => s.moveInput);
  const shortcutsOn = useSettings((s) => s.keyboardShortcuts);
  const { phase, position, description, attempt, learner, opponent, next } = drill;

  useEffect(() => {
    document.title = `What’s the threat? · ${siteConfig.name}`;
  }, []);

  // S shows the threat while it is being looked for; N moves on once a position is done.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = pageShortcutKey(e);
      if (key === 's' && phase === 'threat') drill.reveal();
      else if (key === 'n' && phase === 'done') void next();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drill, phase, next]);

  // The threat stage shows the position with the opponent to move; the defence, the real one.
  const threatStage = phase === 'threat' || (phase === 'checking' && attempt.found === null);
  const boardFen = position ? (threatStage ? (drill.passed ?? position.fen) : position.fen) : null;
  const moving = phase === 'threat' ? opponent : phase === 'defend' ? learner : undefined;
  const dests = useMemo(
    () => (boardFen && moving ? legalDests(new Chess(boardFen)) : new Map()),
    [boardFen, moving],
  );

  const shapes = useMemo<DrawShape[]>(() => {
    if (!position || attempt.found === null) return [];
    const out: DrawShape[] = [arrowOf(position.threat, 'red')];
    if (phase === 'done' && attempt.defence) {
      out.push(arrowOf(attempt.defence.uci, attempt.defence.held ? 'green' : 'paleBlue'));
      const best = position.defences[0];
      if (!attempt.defence.held && best) out.push(arrowOf(best, 'green'));
    }
    return out;
  }, [position, attempt, phase]);

  const total = stats.found + stats.missed;
  const defences = position ? defencesInSan(position) : [];
  const gameMove = position ? gameMoveSan(position) : null;
  const sourceUrl = drill.own ? safeSourceUrl(drill.own.source.url) : null;
  const motifs = (position?.motifs ?? '').split(' ').filter(Boolean);

  const prompt = (() => {
    if (!position) return null;
    switch (phase) {
      case 'threat':
        return (
          <>
            <strong>What does {NAME[opponent]} threaten?</strong> Play it on the board: the move{' '}
            {NAME[opponent]} would make if it were their turn again.
          </>
        );
      case 'checking':
        return attempt.found === null
          ? 'Not the move in the answer — asking the engine whether yours threatens as much…'
          : 'Asking the engine whether your move meets the threat…';
      case 'defend':
        return (
          <>
            {attempt.found ? 'Right: ' : 'The threat: '}
            <San san={description?.san ?? ''} /> {description?.outcome}.{' '}
            <strong>Now meet it</strong> — your move as {NAME[learner]}.
          </>
        );
      case 'done': {
        const defence = attempt.defence;
        return defence ? (
          defence.held ? (
            <>
              <strong>Held:</strong> <San san={defence.san} /> meets the threat.
            </>
          ) : (
            <>
              <strong>Not enough:</strong> after <San san={defence.san} />,{' '}
              <San san={description?.san ?? ''} /> still {description?.outcome ?? 'works'}.
            </>
          )
        ) : (
          <>
            The threat was <San san={description?.san ?? ''} />, which {description?.outcome}.
          </>
        );
      }
      default:
        return null;
    }
  })();

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow">
          <Link to="/drills">Drills</Link> / What’s the threat?
        </p>
        <h1>What’s the threat?</h1>
        <p>
          Before every move, ask what your opponent wants. Name the threat in the position, then
          find a move that meets it.
        </p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          {boardFen ? (
            <Board
              fen={boardFen}
              orientation={learner}
              turnColor={threatStage ? opponent : learner}
              movableColor={moving}
              dests={dests}
              autoShapes={shapes}
              onMove={(from, to) => drill.playMove(from, to)}
              ariaLabel={
                threatStage
                  ? `Threat drill board: play ${opponent}’s threat`
                  : `Threat drill board, ${learner} to move`
              }
            />
          ) : (
            <Board fen="8/8/8/8/8/8/8/8 w - - 0 1" viewOnly ariaLabel="Threat drill board" />
          )}
          {drill.needsPromotion ? (
            <PromotionPicker color={drill.needsPromotion.color} onSelect={drill.resolvePromotion} />
          ) : null}
          {phase === 'loading' ? (
            <div className="trainer__overlay">
              <Spinner label="Finding a position…" />
            </div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          {drill.error ? (
            <Alert tone="danger" role="alert">
              {drill.error}{' '}
              <Button size="sm" onClick={() => void next()}>
                Retry
              </Button>
            </Alert>
          ) : null}

          <Card>
            <div className="row row--between">
              <div className="row">
                <span className={`playerbar__dot playerbar__dot--${learner}`} aria-hidden="true" />
                <strong>You play {NAME[learner]}</strong>
              </div>
              {drill.own ? (
                <Badge tone="accent">
                  {drill.own.source.byLearner ? 'From your game' : 'From a reviewed game'}
                </Badge>
              ) : null}
              {!drill.own && position ? <Badge>Rating {position.rating}</Badge> : null}
            </div>
            <p className="threat__prompt" role="status" data-testid="threat-status">
              {prompt}
            </p>
            {phase === 'threat' && attempt.lastWrong ? (
              <p className="small threat__miss" data-testid="threat-miss">
                Not <San san={attempt.lastWrong} />.{' '}
                {THREAT_TRIES - attempt.misses === 1 ? 'One more try.' : null}
              </p>
            ) : null}
            {moveInput && (phase === 'threat' || phase === 'defend') ? (
              <MoveInput
                onMove={drill.playNotation}
                keepFocus
                placeholder={
                  phase === 'threat' ? `${NAME[opponent]}’s threat, e.g. Qxf7` : 'Your move'
                }
              />
            ) : null}
            <div className="puzzle-actions">
              {phase === 'threat' ? (
                <Button onClick={drill.reveal}>
                  Show the threat {shortcutsOn ? <Kbd>S</Kbd> : null}
                </Button>
              ) : null}
              {phase === 'defend' ? (
                <Button variant="ghost" onClick={drill.skipDefence}>
                  Skip the defence
                </Button>
              ) : null}
              {phase === 'done' ? (
                <Button variant="primary" onClick={() => void next()} autoFocus>
                  Next position {shortcutsOn ? <Kbd>N</Kbd> : null}
                </Button>
              ) : null}
            </div>
            {phase === 'done' && position ? (
              <div
                className="small muted stack-sm"
                style={{ marginTop: 8 }}
                data-testid="threat-summary"
              >
                {defences.length ? (
                  <p style={{ margin: 0 }}>
                    {defences.length === 1 ? 'The defence: ' : 'Ways to meet it: '}
                    {defences.map((san, i) => (
                      <span key={san}>
                        {i > 0 ? ', ' : ''}
                        <San san={san} />
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
                {drill.own ? (
                  <p style={{ margin: 0 }}>
                    From <strong>{drill.own.source.title}</strong>, move{' '}
                    {Math.ceil(drill.own.source.ply / 2)}:{' '}
                    {drill.own.source.byLearner ? 'you' : NAME[learner]} played{' '}
                    <San san={drill.own.source.played} /> and the threat was on.{' '}
                    {sourceUrl ? (
                      <a href={sourceUrl} target="_blank" rel="noreferrer">
                        Source game
                      </a>
                    ) : null}
                  </p>
                ) : gameMove ? (
                  <p style={{ margin: 0 }}>
                    In the game, {NAME[learner]} played <San san={gameMove} /> and lost to it.
                  </p>
                ) : null}
                {motifs.length ? (
                  <p style={{ margin: 0 }}>
                    The idea:{' '}
                    {motifs.map((tag, i) => (
                      <span key={tag}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/puzzles/themes?theme=${encodeURIComponent(tag)}`}>
                          {themeName(tag)}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="puzzle-stats">
              <Stat value={`${stats.found} / ${total}`} label="Threats named" />
              <Stat value={`${stats.defended} / ${stats.defenceTried}`} label="Threats met" />
              <Stat value={stats.bestRun} label={`Best run (now ${stats.run})`} />
            </div>
            {ownCount > 0 ? (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                {ownCount === 1
                  ? 'One threat from your own games comes back here until you have named it twice in a row.'
                  : `${ownCount} threats from your own games come back here until you have named each twice in a row.`}
              </p>
            ) : null}
          </Card>

          <p className="small faint">
            <Notated text="The threat is the move your opponent would play if it were their turn again — after a pass. Strong players ask about it before every move: checks, captures and threats first." />{' '}
            Positions come from real games, where the side to move missed the threat; reviewing your
            own games on the <Link to="/analyze">analysis board</Link> adds the threats you missed.
            More in the lesson{' '}
            <Link to="/learn/defence-and-prophylaxis">Defence and prophylaxis</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
