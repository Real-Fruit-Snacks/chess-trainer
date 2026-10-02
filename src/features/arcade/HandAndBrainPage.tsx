import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import type { LongColor } from '@/chess/types';
import { ENGINE_LEVELS } from '@/engine/levels';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { callAccuracy, describeCall, PIECE_LABEL, type Role, summarizeCalls } from './handAndBrain';
import { useHandAndBrain } from './useHandAndBrain';
import '@/features/play/play.css';
import './arcade.css';
import { San } from '@/chess/San';

export default function HandAndBrainPage() {
  const hb = useHandAndBrain();
  const settings = useSettings();
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade['hand-and-brain']);
  const [role, setRole] = useState<Role>('brain');
  const [color, setColor] = useState<LongColor | 'random'>('white');
  const [levelId, setLevelId] = useState(settings.playLevel);
  const [confirmResign, setConfirmResign] = useState(false);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Hand & Brain · ${siteConfig.name}`;
  }, []);

  const { position } = hb.game;
  const summary = summarizeCalls(hb.calls);
  const lastCall = hb.calls[hb.calls.length - 1];

  const begin = () => {
    recordedRef.current = false;
    setConfirmResign(false);
    hb.start({ role, color, levelId });
  };

  useEffect(() => {
    if (!hb.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    const { verdict } = hb.gameOver;
    const outcome = verdict === 'win' ? 'beat' : verdict === 'draw' ? 'drew with' : 'lost to';
    const roleName = hb.role === 'brain' ? 'Brain' : 'Hand';
    recordArcade(
      'hand-and-brain',
      summary.accuracy,
      `${roleName} · ${summary.accuracy}% · ${outcome} Level ${hb.level.id}`,
    );
  }, [hb.gameOver, hb.role, hb.level.id, summary.accuracy, recordArcade]);

  const over = hb.gameOver;
  const topColor: LongColor = hb.playerColor === 'white' ? 'black' : 'white';
  const engineName = `Stockfish · ${hb.level.name}`;
  const handTurn = hb.role === 'hand' && hb.handCall && !hb.busy && !over;

  const status = !hb.started
    ? ''
    : over
      ? ''
      : hb.busy === 'opponent'
        ? 'The opponent is thinking…'
        : hb.busy === 'partner'
          ? hb.role === 'brain'
            ? lastCall && hb.calls.length && position.turn === hb.playerColor
              ? 'Your partner is working out the move…'
              : 'Your partner is studying the position…'
            : 'Your partner is studying the position…'
          : hb.busy === 'grading'
            ? 'Your partner is checking your move…'
            : hb.role === 'brain'
              ? 'Your call: which piece should move?'
              : hb.handCall
                ? `Your partner says: ${PIECE_LABEL[hb.handCall.type]}! Find the move.`
                : '';

  const overlay = !hb.started ? (
    <Card className="arcade__summary">
      <h2>Hand & Brain</h2>
      <p className="muted">
        Full-strength Stockfish is your partner. As the <strong>Brain</strong> you say which piece
        moves and it finds the move; as the <strong>Hand</strong> it names the piece and you find
        the move.
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
        <Field label="Opponent">
          {(id) => (
            <Select
              id={id}
              value={levelId}
              onChange={(e) => setLevelId(Number(e.target.value))}
              data-testid="hb-level"
            >
              {ENGINE_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  Level {l.id} · {l.name} (~{l.approxElo})
                </option>
              ))}
            </Select>
          )}
        </Field>
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
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
      </h2>
      <div className="arcade__scoreline">
        <Stat
          value={`${summary.accuracy}%`}
          label={`${hb.role === 'brain' ? 'Brain' : 'Hand'} accuracy`}
        />
        <Stat value={summary.counts.best + summary.counts.good} label="Good calls" />
        <Stat
          value={summary.counts.mistake + summary.counts.blunder}
          label="Mistakes and blunders"
        />
      </div>
      <p className="muted">
        {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)}. {summary.calls} call
        {summary.calls === 1 ? '' : 's'} against {hb.level.name}.
      </p>
      <div className="row">
        <Button variant="primary" onClick={begin}>
          Play again
        </Button>
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
            thinking={hb.busy === 'partner' || hb.busy === 'grading'}
          />
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
            <p className="arcade__status" role="status" data-testid="hb-status">
              {status}
            </p>
            {hb.role === 'brain' && hb.started && !over ? (
              <div className="arcade__pieces" data-testid="hb-pieces">
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
                  {lastCall.grade}
                </Badge>{' '}
                {describeCall(lastCall, hb.role)}
              </p>
            ) : null}
            {hb.started ? (
              <div className="row row--between" style={{ marginTop: 12 }}>
                <span className="small muted">
                  {summary.calls} call{summary.calls === 1 ? '' : 's'} · accuracy{' '}
                  <strong data-testid="hb-accuracy">{summary.accuracy}%</strong>
                </span>
                {!over ? (
                  confirmResign ? (
                    <span className="row">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          hb.resign();
                          setConfirmResign(false);
                        }}
                      >
                        Resign
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                        Keep playing
                      </Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmResign(true)}>
                      Resign
                    </Button>
                  )
                ) : null}
              </div>
            ) : best ? (
              <p className="small muted" style={{ margin: 0 }}>
                Best: {best.detail}
              </p>
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
            <MoveList
              moves={position.history}
              currentPly={position.history.length}
              onSelectPly={() => undefined}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
