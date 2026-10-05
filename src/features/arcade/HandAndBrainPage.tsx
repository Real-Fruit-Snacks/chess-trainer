import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Segmented,
  Select,
  Spinner,
  Stat,
  LinkButton,
} from '@/components/ui';
import { Notated, San } from '@/chess/San';
import type { LongColor } from '@/chess/types';
import { NONE } from '@/lib/format';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import {
  AnalyzeGameButton,
  EngineLevelField,
  FocusToggle,
  GameExportButtons,
  ResignDialog,
} from './arcadeControls';
import { useArcadeFocus } from './arcadeGame';
import {
  callAccuracy,
  describeCall,
  GRADE_LABEL,
  HAND_AND_BRAIN_SCORING,
  handAndBrainScore,
  MIN_SCORED_CALLS,
  PIECE_LABEL,
  type Role,
  summarizeCalls,
} from './handAndBrain';
import { useHandAndBrain } from './useHandAndBrain';
import { useStackedLayout } from '@/lib/useStackedLayout';
import '@/features/play/play.css';
import './arcade.css';

export default function HandAndBrainPage() {
  const hb = useHandAndBrain();
  const settings = useSettings();
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade['hand-and-brain']);
  const [role, setRole] = useState<Role>('brain');
  const [color, setColor] = useState<LongColor | 'random'>('white');
  const [levelId, setLevelId] = useState(settings.playLevel);
  /** The setup card after "New game" (it is also up before the first game). */
  const [settingUp, setSettingUp] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  /** The finished game's score, or null when it was not scored (resigned too early). */
  const [lastScore, setLastScore] = useState<number | null>(null);
  const recordedRef = useRef(false);
  // On a phone the panel is under the board: the calls go right under the board instead.
  const stacked = useStackedLayout();

  useEffect(() => {
    document.title = `Hand & Brain · ${siteConfig.name}`;
  }, []);

  useArcadeFocus(hb.started && !hb.gameOver);

  const { position } = hb.game;
  const summary = summarizeCalls(hb.calls);
  const lastCall = hb.calls[hb.calls.length - 1];

  /** A game with the chosen role, colour and level (Play again keeps them). */
  const begin = () => {
    recordedRef.current = false;
    setSettingUp(false);
    setLastScore(null);
    hb.start({ role, color, levelId });
  };

  useEffect(() => {
    if (!hb.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    const { verdict, reason } = hb.gameOver;
    const score = handAndBrainScore({
      accuracy: summary.accuracy,
      calls: summary.calls,
      levelId: hb.level.id,
      resigned: reason === 'resignation',
    });
    setLastScore(score);
    // A resignation after a call or two proves nothing: it is not scored at all.
    if (score === null) return;
    const outcome = verdict === 'win' ? 'beat' : verdict === 'draw' ? 'drew with' : 'lost to';
    const roleName = hb.role === 'brain' ? 'Brain' : 'Hand';
    recordArcade(
      'hand-and-brain',
      score,
      `${roleName} · ${summary.accuracy}% over ${summary.calls} call${summary.calls === 1 ? '' : 's'} · ${outcome} Level ${hb.level.id}`,
    );
  }, [hb.gameOver, hb.role, hb.level.id, summary.accuracy, summary.calls, recordArcade]);

  const over = hb.gameOver;
  const topColor: LongColor = hb.playerColor === 'white' ? 'black' : 'white';
  const engineName = `Stockfish · ${hb.level.name}`;
  const handTurn = hb.role === 'hand' && hb.handCall && !hb.busy && !over;

  const status =
    !hb.started || over
      ? ''
      : hb.busy === 'opponent'
        ? 'The opponent is thinking…'
        : hb.busy === 'partner'
          ? 'Your partner is studying the position…'
          : hb.busy === 'partner-move'
            ? 'Your partner is working out the move…'
            : hb.busy === 'grading'
              ? 'Your partner is checking your move…'
              : hb.role === 'brain'
                ? 'Your call: which piece should move?'
                : hb.handCall
                  ? `Your partner says: ${PIECE_LABEL[hb.handCall.type]}! Find the move.`
                  : '';

  /** The status line and the Brain's piece buttons: beside the board, or under it on a phone. */
  const calls = (
    <>
      <p className="arcade__status" role="status" data-testid="hb-status">
        {status}
      </p>
      {hb.role === 'brain' && hb.started && !over ? (
        <div
          className="arcade__pieces"
          data-testid="hb-pieces"
          role="group"
          aria-label="Call a piece"
        >
          {hb.options.map((type) => (
            <Button
              key={type}
              className="arcade__piece"
              variant="secondary"
              onClick={() => hb.callPiece(type)}
              disabled={!hb.brainReady}
              data-testid={`hb-call-${type}`}
            >
              {PIECE_LABEL[type]}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );

  const overlay =
    !hb.started || settingUp ? (
      <Card className="arcade__summary">
        <h2>Hand & Brain</h2>
        <p className="muted">
          Full-strength Stockfish is your partner against an engine at the level you choose. As the{' '}
          <strong>Brain</strong> you say which piece moves and it finds the move; as the{' '}
          <strong>Hand</strong> it names the piece and you find the move.
        </p>
        <div className="stack" style={{ textAlign: 'left' }}>
          <Field label="Your role">
            {() => (
              <Segmented
                ariaLabel="Role"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'brain', label: 'Brain' },
                  { value: 'hand', label: 'Hand' },
                ]}
              />
            )}
          </Field>
          <EngineLevelField value={levelId} onChange={setLevelId} testId="hb-level" />
          <Field label="Your colour">
            {(id) => (
              <Select
                id={id}
                value={color}
                onChange={(e) => setColor(e.target.value as LongColor | 'random')}
              >
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="random">Random</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            size="lg"
            onClick={begin}
            disabled={hb.engineStatus === 'error'}
            data-testid="hb-start"
          >
            Start
          </Button>
        </div>
      </Card>
    ) : over ? (
      <Card className="arcade__summary" data-testid="hb-result">
        <h2>
          {over.verdict === 'win'
            ? 'You win'
            : over.verdict === 'draw'
              ? 'Draw'
              : 'The engine wins'}
        </h2>
        <div className="arcade__scoreline">
          <Stat
            value={`${summary.accuracy}%`}
            label={`${hb.role === 'brain' ? 'Brain' : 'Hand'} accuracy`}
          />
          <Stat value={summary.calls} label={summary.calls === 1 ? 'Call' : 'Calls'} />
          <Stat value={lastScore ?? NONE} label="Score" />
        </div>
        <p className="muted" data-testid="hb-score-note">
          {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)} against Level {hb.level.id}
          {' · '}
          {hb.level.name}.{' '}
          {lastScore === null
            ? `Resigned before ${MIN_SCORED_CALLS} calls, so the game is not scored.`
            : `${summary.counts.best + summary.counts.good} good calls, ${
                summary.counts.mistake + summary.counts.blunder
              } mistakes and blunders.`}
        </p>
        <div className="row arcade__summary-actions">
          <Button
            variant="primary"
            onClick={begin}
            title="The same role, colour and engine level"
            data-testid="hb-again"
          >
            Play again
          </Button>
          <Button onClick={() => setSettingUp(true)} data-testid="hb-new">
            New game
          </Button>
          <AnalyzeGameButton pgn={hb.pgn} orientation={hb.playerColor} />
          <LinkButton to="/arcade">Arcade</LinkButton>
        </div>
      </Card>
    ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Hand & Brain
        </p>
        <h1>Hand & Brain</h1>
        <p>
          Two halves of one mind. The Brain decides which piece should act; the Hand finds the exact
          move. Stockfish takes whichever half you do not.
        </p>
      </div>

      {hb.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {hb.engineError?.message}{' '}
          <Button size="sm" onClick={() => void hb.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="trainer">
        <div className="play__boardcol">
          <PlayerBar
            name={engineName}
            color={topColor}
            fen={position.fen}
            thinking={hb.busy === 'opponent'}
          />
          <div className="trainer__board" style={{ position: 'relative' }}>
            <Board
              fen={position.fen}
              orientation={hb.playerColor}
              turnColor={position.turn}
              movableColor={handTurn ? hb.playerColor : undefined}
              dests={hb.dests}
              lastMove={position.lastMove}
              check={position.inCheck}
              onMove={(from, to) => hb.playerMove(from, to)}
              ariaLabel={`Hand and Brain board, ${position.turn} to move`}
            />
            {hb.game.pendingPromotion ? (
              <PromotionPicker
                color={hb.game.pendingPromotion.color}
                onSelect={hb.resolvePromotion}
              />
            ) : null}
            {overlay ? <div className="trainer__overlay">{overlay}</div> : null}
          </div>
          <PlayerBar
            name={`You (${hb.role === 'brain' ? 'Brain' : 'Hand'}) + Stockfish`}
            color={hb.playerColor}
            fen={position.fen}
            thinking={hb.busy === 'partner' || hb.busy === 'partner-move' || hb.busy === 'grading'}
          />
          {stacked && hb.started ? <div className="arcade__calls-under">{calls}</div> : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>
                {hb.started
                  ? `You are the ${hb.role === 'brain' ? 'Brain' : 'Hand'}`
                  : 'Hand & Brain'}
              </strong>
              {hb.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </div>
            {stacked && hb.started ? null : calls}
            {lastCall ? (
              <p className="small" style={{ margin: '12px 0 0' }} data-testid="hb-last-call">
                <Badge
                  tone={
                    lastCall.grade === 'best' || lastCall.grade === 'good'
                      ? 'success'
                      : lastCall.grade === 'inaccuracy'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {GRADE_LABEL[lastCall.grade]}
                </Badge>{' '}
                <Notated text={describeCall(lastCall, hb.role)} />
              </p>
            ) : null}
            {hb.started ? (
              <div className="row row--between" style={{ marginTop: 12 }}>
                <span className="small muted">
                  {summary.calls} call{summary.calls === 1 ? '' : 's'} · accuracy{' '}
                  <strong data-testid="hb-accuracy">{summary.accuracy}%</strong>
                </span>
                <span className="row">
                  <FocusToggle />
                  {!over ? (
                    <Button size="sm" variant="danger" onClick={() => setConfirmResign(true)}>
                      Resign
                    </Button>
                  ) : null}
                </span>
              </div>
            ) : null}
            <p className="small muted" style={{ margin: '12px 0 0' }} data-testid="hb-scoring">
              {HAND_AND_BRAIN_SCORING}
              {best ? ` Best: ${best.best} — ${best.detail ?? ''}.` : ''}
            </p>
          </Card>

          {hb.calls.length > 0 ? (
            <Card>
              <strong>Your calls</strong>
              <ol className="small" style={{ margin: '8px 0 0', paddingLeft: '1.2em' }}>
                {hb.calls
                  .slice(-8)
                  .reverse()
                  .map((call) => (
                    <li key={call.ply}>
                      {PIECE_LABEL[call.type]} → <San san={call.san} /> ·{' '}
                      {callAccuracy(call.lossCp)}%
                      {call.grade !== 'best' ? (
                        <>
                          {' (best '}
                          <San san={call.bestSan} />)
                        </>
                      ) : null}
                    </li>
                  ))}
              </ol>
            </Card>
          ) : null}

          <Card>
            <MoveList moves={position.history} currentPly={position.history.length} />
            <div className="row arcade__game-actions">
              <GameExportButtons
                pgn={hb.pgn}
                orientation={hb.playerColor}
                disabled={position.history.length === 0}
              />
            </div>
          </Card>
        </aside>
      </div>

      <ResignDialog
        open={confirmResign && hb.started && !over}
        onClose={() => setConfirmResign(false)}
        onConfirm={hb.resign}
      >
        {summary.calls < MIN_SCORED_CALLS
          ? `The game ends as a loss. With fewer than ${MIN_SCORED_CALLS} calls it is not scored.`
          : 'The game ends as a loss; your calls so far are scored.'}
      </ResignDialog>
    </div>
  );
}
