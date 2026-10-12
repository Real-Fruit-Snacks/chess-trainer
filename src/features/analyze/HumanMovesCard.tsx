import { type ReactNode, useMemo } from 'react';
import { Notated, San } from '@/chess/San';
import type { Fen, Uci } from '@/chess/types';
import { Alert, Badge, Button, Card, ProgressBar, Switch, type Tone } from '@/components/ui';
import type { EngineClient } from '@/engine/EngineClient';
import { useMaiaStatus } from '@/engine/maia/maiaClient';
import { useMaiaDownload } from '@/engine/maia/maiaDownload';
import { HUMAN_RATINGS } from '@/engine/maia/ratings';
import { formatScore } from '@/engine/uci';
import { MAIA_TOTAL_BYTES } from '@/sw/maiaFiles';
import { useSettings } from '@/store/settings';
import { type HumanVerdict, trapNote, verdictOf } from './humanMoves';
import { type CheckMode, useHumanChecks, useHumanPrediction } from './useHumanMoves';
import './human-moves.css';

const MB = 1_000_000;
const DOWNLOAD_MB = Math.round(MAIA_TOTAL_BYTES / MB);

const VERDICT: Record<HumanVerdict['judgement'], { label: string; tone: Tone }> = {
  best: { label: 'Best', tone: 'success' },
  good: { label: 'Good', tone: 'neutral' },
  inaccuracy: { label: 'Inaccuracy', tone: 'info' },
  mistake: { label: 'Mistake', tone: 'warning' },
  blunder: { label: 'Blunder', tone: 'danger' },
};

/**
 * "Human moves": what players of a chosen rating play in the position, from
 * the human-like model (Maia, downloaded on request), each move with its
 * share and the engine's verdict, and a warning when the move most of them
 * choose is a mistake. Clicking a move plays it on the board.
 */
export function HumanMovesCard({
  fen,
  gameOver,
  onPlay,
  engine,
  checkMode,
  hint,
}: {
  fen: Fen;
  gameOver: boolean;
  onPlay: (uci: Uci) => void;
  /** The page's engine, for the verdicts. */
  engine: () => Pick<EngineClient, 'search'>;
  /** When the engine may look at the moves (see `CheckMode`). */
  checkMode: CheckMode;
  /** The analysis's best move in the position, once it has one. */
  hint: Uci | null;
}) {
  const enabled = useSettings((s) => s.analysisHumanMoves);
  const rating = useSettings((s) => s.analysisHumanRating);
  const update = useSettings((s) => s.update);
  const files = useMaiaDownload();
  const maia = useMaiaStatus();
  const active = enabled && files.downloaded === true && !gameOver;
  const { prediction, retry } = useHumanPrediction(fen, rating, active);
  const moves = useMemo(
    () => (prediction.status === 'ready' ? prediction.moves : []),
    [prediction],
  );
  const ucis = useMemo(() => moves.map((m) => m.uci), [moves]);
  const checks = useHumanChecks({ fen, moves: ucis, engine, mode: checkMode, hint });
  const top = moves[0];
  const { check } = checks;
  // The commentary behind the note reads the board: worked out once per position and check,
  // not on every update of the engine's lines.
  const trap = useMemo(
    () => (top && check ? trapNote(fen, top, check, rating) : null),
    [fen, top, check, rating],
  );
  const whiteToMove = fen.split(' ')[1] !== 'b';
  const waitingForRequest = checkMode === 'manual' && !checks.requested;

  let body: ReactNode;
  if (!enabled) {
    body = (
      <p className="small muted humanmoves__note">
        What players of a chosen rating play here, with the engine’s verdict on each move — from
        Maia, a model trained on millions of real games.
      </p>
    );
  } else if (!files.canStore) {
    body = (
      <p className="small muted humanmoves__note">
        This browser cannot keep files for the app (it needs a secure connection and site storage),
        so human moves cannot be shown here.
      </p>
    );
  } else if (files.progress) {
    const total = files.progress.total || MAIA_TOTAL_BYTES;
    body = (
      <div className="stack-sm humanmoves__note">
        <ProgressBar
          value={files.progress.received}
          max={total}
          label="Human-like model download"
          valueText={`${Math.round(files.progress.received / MB)} of ${Math.round(total / MB)} MB`}
        />
        <div className="row row--between">
          <span className="small muted" role="status">
            Downloading the human-like model: {Math.round(files.progress.received / MB)} of{' '}
            {Math.round(total / MB)} MB.
          </span>
          <Button size="sm" variant="ghost" onClick={files.stop}>
            Stop
          </Button>
        </div>
      </div>
    );
  } else if (files.downloaded === null) {
    body = (
      <p className="small muted humanmoves__note" role="status">
        Checking whether the human-like model is on this device…
      </p>
    );
  } else if (!files.downloaded) {
    body = (
      <div className="row row--between humanmoves__note">
        <span className="small muted">
          Human moves need the human-like model: a one-time download of about {DOWNLOAD_MB} MB, kept
          on this device and used offline.
        </span>
        <Button size="sm" onClick={files.start} data-testid="human-moves-download">
          Download ({DOWNLOAD_MB} MB)
        </Button>
      </div>
    );
  } else if (gameOver) {
    body = (
      <p className="small muted humanmoves__note">The game is over: there is no move to make.</p>
    );
  } else if (prediction.status === 'failed') {
    body = (
      <div className="row row--between humanmoves__note">
        <span className="small muted" role="status">
          The human-like model could not start: {prediction.error}
        </span>
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  } else if (prediction.status !== 'ready') {
    body = (
      <p className="small muted humanmoves__note" role="status">
        {maia.status === 'loading' ? 'Starting the human-like model…' : 'Asking the model…'}
      </p>
    );
  } else {
    body = (
      <>
        <p className="small muted humanmoves__note">
          What players rated {rating} play here, and how often
          {checkMode === 'off' ? '' : ', with the engine’s verdict on each move'}.
        </p>
        {trap ? (
          <div className="humanmoves__trap" data-testid="human-moves-trap">
            <Alert tone="warning">
              <Notated text={trap} />
            </Alert>
          </div>
        ) : null}
        <table className="humanmoves__table">
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col">Played</th>
              <th scope="col">Engine</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => {
              const verdict = checks.check ? verdictOf(checks.check, move.uci) : null;
              const share = Math.round(move.probability * 100);
              return (
                <tr key={move.uci} data-testid="human-move">
                  <td>
                    <button
                      type="button"
                      className="humanmoves__move"
                      onClick={() => onPlay(move.uci)}
                      title={`Play ${move.san}`}
                    >
                      <San san={move.san} />
                    </button>
                  </td>
                  <td>
                    <span className="humanmoves__share">
                      <span className="humanmoves__bar" aria-hidden="true">
                        <span
                          className="humanmoves__fill"
                          style={{ width: `${Math.max(2, move.probability * 100)}%` }}
                        />
                      </span>
                      <span className="humanmoves__pct">{share < 1 ? '<1' : share}%</span>
                    </span>
                  </td>
                  <td>
                    {verdict ? (
                      <span className="humanmoves__verdict">
                        <Badge tone={VERDICT[verdict.judgement].tone}>
                          {VERDICT[verdict.judgement].label}
                        </Badge>
                        <span className="small faint">
                          {formatScore(verdict.score, whiteToMove)}
                        </span>
                      </span>
                    ) : checkMode === 'off' || waitingForRequest ? (
                      <span className="small faint">—</span>
                    ) : (
                      <span className="small muted">checking…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {waitingForRequest && checks.waiting.length > 0 ? (
          <div className="row row--between humanmoves__note">
            <span className="small muted">The engine is off.</span>
            <Button size="sm" onClick={checks.request}>
              Check these moves
            </Button>
          </div>
        ) : checkMode === 'off' ? (
          <p className="small muted humanmoves__note">
            The engine is not running, so the moves are not judged.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <Card data-testid="human-moves">
      <div className="row row--between">
        <Switch
          checked={enabled}
          onChange={(next) => update({ analysisHumanMoves: next })}
          label="Human moves"
        />
        {enabled ? (
          <label className="small muted">
            Rating{' '}
            <select
              className="select humanmoves__rating"
              value={rating}
              onChange={(e) => update({ analysisHumanRating: Number(e.target.value) })}
              aria-label="Rating of the players"
            >
              {HUMAN_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {body}
    </Card>
  );
}
