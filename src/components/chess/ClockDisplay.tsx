import { formatClock } from '@/lib/clock';
import './chess-components.css';

export function ClockDisplay({
  ms,
  running,
  lowTimeMs = 10_000,
}: {
  ms: number;
  running: boolean;
  lowTimeMs?: number;
}) {
  const low = ms <= lowTimeMs;
  return (
    <span
      className={`clock${running ? ' clock--running' : ''}${low ? ' clock--low' : ''}`}
      role="timer"
      aria-live="off"
      aria-label={`${formatClock(ms)} remaining`}
    >
      {formatClock(ms)}
    </span>
  );
}
