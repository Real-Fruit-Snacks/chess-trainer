import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { Alert, Badge, Button, Card, Spinner, Stat, LinkButton } from '@/components/ui';
import { ChoiceCards, ColourChoice, SetupScreen } from '@/components/setup/SetupScreen';
import { useFocusBoardAfterSetup } from '@/components/setup/useFocusBoardAfterSetup';
import { START_FEN } from '@/chess/helpers';
import { getLevel } from '@/engine/levels';
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
  const setupShown = !hb.started || settingUp;
  const boardColRef = useRef<HTMLDivElement>(null);
  useFocusBoardAfterSetup(setupShown, boardColRef);

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
  // While setting up: the side and the level chosen; during a game, the game's.
  const boardSide: LongColor = setupShown
    ? color === 'black'
      ? 'black'
      : 'white'
    : hb.playerColor;
  const topColor: LongColor = boardSide === 'white' ? 'black' : 'white';
  const engineName = `Stockfish · ${(setupShown ? getLevel(levelId) : hb.level).name}`;
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
      <p
        className={`arcade__status${!hb.started || over ? ' arcade__status--idle' : ''}`}
        role="status"
        data-testid="hb-status"
      >
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

  const overlay = setupShown ? null : over ? (
    <Card className="arcade__summary" data-testid="hb-result">
      <h2>
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
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

      <div className={setupShown ? 'trainer trainer--setup' : 'trainer'}>
        <div className="play__boardcol" ref={boardColRef}>
          <PlayerBar
            name={engineName}
            color={topColor}
            fen={setupShown ? START_FEN : position.fen}
            thinking={!setupShown && hb.busy === 'opponent'}
          />
          <div className="trainer__board">
            {setupShown ? (
              <Board
                fen={START_FEN}
                orientation={boardSide}
                viewOnly
                ariaLabel={`The game's starting position, ${boardSide === 'white' ? 'White' : 'Black'} at the bottom`}
              />
            ) : (
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
            )}
            {!setupShown && hb.game.pendingPromotion ? (
              <PromotionPicker
                color={hb.game.pendingPromotion.color}
                onSelect={hb.resolvePromotion}
              />
            ) : null}
            {overlay ? <div className="trainer__overlay">{overlay}</div> : null}
          </div>
          <PlayerBar
            name={`You (${(setupShown ? role : hb.role) === 'brain' ? 'Brain' : 'Hand'}) + Stockfish`}
            color={boardSide}
            fen={setupShown ? START_FEN : position.fen}
            thinking={
              !setupShown &&
              (hb.busy === 'partner' || hb.busy === 'partner-move' || hb.busy === 'grading')
            }
          />
          {stacked && hb.started && !setupShown ? (
            <div className="arcade__calls-under">{calls}</div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          {setupShown ? (
            <SetupScreen
              intro="Full-strength Stockfish is your partner against an engine at the level you choose."
              onStart={begin}
              startDisabled={hb.engineStatus === 'error'}
              startTestId="hb-start"
              focusOnMount={settingUp}
              back={
                settingUp
                  ? { label: 'Back to the board', onClick: () => setSettingUp(false) }
                  : null
              }
            >
              <ChoiceCards
                name="hb-role"
                legend="Your role"
                value={role}
                onChange={setRole}
                choices={[
                  {
                    value: 'brain',
                    title: 'Brain',
                    description: 'You say which piece moves; your partner finds the move.',
                    icon: 'brain',
                  },
                  {
                    value: 'hand',
                    title: 'Hand',
                    description: 'Your partner names the piece; you find the move.',
                    icon: 'knight',
                  },
                ]}
              />
              <EngineLevelField value={levelId} onChange={setLevelId} testId="hb-level" describe />
              <ColourChoice value={color} onChange={setColor} />
              <p className="small muted setup__note" data-testid="hb-scoring">
                {HAND_AND_BRAIN_SCORING}
                {best ? ` Your best: ${best.best} — ${best.detail ?? ''}.` : ''}
              </p>
            </SetupScreen>
          ) : (
            <>
              <Card>
                <div className="row row--between">
                  <strong>{`You are the ${hb.role === 'brain' ? 'Brain' : 'Hand'}`}</strong>
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
            </>
          )}
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
