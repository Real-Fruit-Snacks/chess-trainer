import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, type DrawShape } from '@/components/board/Board';
import { Button, Icon, Kbd } from '@/components/ui';
import { moveLabel } from '@/chess/helpers';
import { San } from '@/chess/San';
import { type ArbiterPace, callWindowMs, leadInMs, stepMs } from '@/features/arcade/arbiter';
import { KIND_TITLES } from '@/features/arcade/arbiterMoves';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { playSound } from '@/lib/sound';
import { arbiterRoundItems, arbiterRoundOf, classicReplays } from '../duelRounds';
import { resultWords } from '../duelView';
import type { DuelReport, DuelSession, DuelView } from '../types';
import { EMPTY_FEN } from './RaceRound';

type Call = 'caught' | 'false' | 'missed';

/**
 * A round of an Arbiter duel: the same stretch of a classic game replays on
 * both boards at the same pace, then the illegal move. The first to call it
 * takes the round; a call on a legal move is out of it. The replay runs on
 * this device's clock from the moment the round goes live, and so does the
 * call's time.
 */
export function ArbiterDuelRound({
  view,
  session,
  overlay,
  opponentName,
}: {
  view: DuelView;
  session: DuelSession;
  overlay: ReactNode;
  opponentName: string;
}) {
  const item = arbiterRoundItems(view.items)[view.round] ?? null;
  const round = useMemo(() => (item ? arbiterRoundOf(item, classicReplays()) : null), [item]);
  const pace: ArbiterPace = view.opts.pace === 'slow' ? 'slow' : 'normal';
  // Every round a little faster, as in the arcade.
  const speed = view.round + 1;
  const live = view.status === 'playing' && view.phase === 'live';
  const reveal = view.phase === 'reveal';
  /** Moves of the round on the board: 0 the start, `lead.length + 1` the illegal move. */
  const [shown, setShown] = useState(0);
  const [call, setCall] = useState<Call | null>(null);
  const liveAt = useRef<number | null>(null);
  const illegalAt = useRef(0);
  const number = view.round;
  const report = useCallback((result: DuelReport) => session.report(result), [session]);

  const decide = (outcome: Call, ms: number) => {
    setCall(outcome);
    report({ round: number, call: outcome, ms });
  };

  // The replay: the start, each real move, then the illegal one and the time to call it.
  useEffect(() => {
    if (!live || call) return;
    if (!round) {
      // A round this device cannot read is one it cannot call.
      setCall('missed');
      report({ round: number, call: 'missed', ms: 0 });
      return;
    }
    liveAt.current ??= performance.now();
    if (shown <= round.lead.length) {
      const delay = shown === 0 ? leadInMs(speed, pace) : stepMs(speed, pace);
      const timer = window.setTimeout(() => {
        const next = shown + 1;
        const san = next <= round.lead.length ? round.lead[next - 1]?.san : round.illegal.san;
        if (next > round.lead.length) illegalAt.current = performance.now();
        playSound(san?.includes('x') ? 'capture' : 'move');
        setShown(next);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => {
        setCall('missed');
        report({ round: number, call: 'missed', ms: 0 });
        playSound('failed');
      },
      callWindowMs(speed, pace),
    );
    return () => window.clearTimeout(timer);
  }, [live, call, round, shown, speed, pace, number, report]);

  const onCall = () => {
    if (!live || !round || call || shown === 0) return;
    const now = performance.now();
    if (shown > round.lead.length) {
      decide('caught', now - illegalAt.current);
      playSound('solved');
    } else {
      decide('false', now - (liveAt.current ?? now));
      playSound('failed');
    }
  };
  const callRef = useRef(onCall);
  callRef.current = onCall;

  // Space calls the move, as in the arcade.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (pageShortcutKey(e) !== ' ') return;
      e.preventDefault();
      callRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  const onIllegal = !!round && (shown > round.lead.length || reveal);
  const shownMove = round && shown > 0 && !onIllegal ? round.lead[shown - 1] : undefined;
  let fen = EMPTY_FEN;
  let lastMove: [string, string] | null = null;
  if (round && (live || reveal)) {
    if (onIllegal) {
      fen = round.illegal.fen;
      lastMove = [round.illegal.from, round.illegal.to];
    } else if (shownMove) {
      fen = shownMove.fen;
      lastMove = [shownMove.from, shownMove.to];
    } else {
      fen = round.startFen;
    }
  }
  const shapes = useMemo<DrawShape[]>(() => {
    if (!reveal || !round) return [];
    const { arrows, marks, hints } = round.illegal;
    return [
      ...arrows.map(([orig, dest]) => ({ orig, dest, brush: 'red' })),
      ...marks.map((orig) => ({ orig, brush: 'red' })),
      ...hints.map((orig) => ({ orig, brush: 'green' })),
    ];
  }, [reveal, round]);
  const label =
    round && onIllegal
      ? moveLabel(round.startPly + round.lead.length)
      : round && shownMove
        ? moveLabel(round.startPly + shown - 1)
        : null;
  const san = onIllegal ? round?.illegal.san : shownMove?.san;

  const theirs = view.theirs && 'call' in view.theirs ? view.theirs : null;

  return (
    <>
      <div className="trainer__board">
        <Board
          fen={fen}
          orientation="white"
          viewOnly
          lastMove={lastMove as never}
          autoShapes={shapes}
          animate
          announceMoves={false}
          ariaLabel="Arbiter board"
        />
        {overlay}
      </div>
      {live ? (
        <div className="stack arbiter__controls">
          <Button
            variant="danger"
            size="lg"
            block
            className="arbiter__call"
            onClick={onCall}
            disabled={!!call || shown === 0}
            aria-keyshortcuts="Space"
            data-testid="duel-call"
          >
            <Icon name="whistle" size={24} /> Illegal!
            <Kbd>
              <span aria-hidden="true">Space</span>
            </Kbd>
          </Button>
          <div className="duel__status">
            <p className="duel__status-mine" role="status" data-testid="arbiter-move">
              {call === 'caught' ? (
                `${resultWords(view.mine ?? { call: 'caught', ms: 0 })}.`
              ) : call === 'false' ? (
                'That move was legal: you are out of this round.'
              ) : call === 'missed' ? (
                'The illegal move went by.'
              ) : label && san ? (
                <>
                  {label}
                  <San san={san} />
                </>
              ) : (
                'Watch the board…'
              )}
            </p>
            {round?.title ? (
              <p className="small muted duel__status-theirs">
                {round.title} · {round.caption}
              </p>
            ) : null}
            <p className="small muted duel__status-theirs" aria-live="polite">
              {theirs
                ? theirs.call === 'caught'
                  ? `${opponentName} called it.`
                  : theirs.call === 'false'
                    ? `${opponentName} called a legal move.`
                    : `${opponentName} missed it.`
                : `${opponentName} is watching.`}
            </p>
          </div>
        </div>
      ) : null}
      {reveal && round ? (
        <div className="duel__explain" data-testid="arbiter-explain">
          <p className="arbiter__verdict-kind">
            {KIND_TITLES[round.illegal.kind]}: <San san={round.illegal.san} />
          </p>
          <p className="small">{round.illegal.reason}</p>
        </div>
      ) : null}
    </>
  );
}
