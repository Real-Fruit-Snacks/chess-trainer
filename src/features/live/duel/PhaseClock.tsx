import { useTicker } from '@/lib/useTicker';
import { formatCountdown, monotonicNow } from '../liveView';

/** The time left in the round on, ticking: a duel's and a race room's. */
export function PhaseClock({ ends, label }: { ends: number; label: string }) {
  useTicker(true);
  return (
    <p className="duel__clock">
      <span className="small muted">{label}</span>{' '}
      <span className="duel__clock-time" role="timer">
        {formatCountdown(ends - monotonicNow())}
      </span>
    </p>
  );
}

/** What covers the board before a round: what comes, and the seconds to it. */
export function CountdownOverlay({ ends, label }: { ends: number; label: string }) {
  useTicker(true);
  const left = Math.max(1, Math.ceil((ends - monotonicNow()) / 1000));
  return (
    <div className="trainer__overlay duel__overlay" data-testid="duel-countdown">
      <div className="duel__countdown">
        <span className="duel__countdown-round">{label}</span>
        <span className="duel__countdown-number" aria-hidden="true">
          {left}
        </span>
      </div>
    </div>
  );
}
