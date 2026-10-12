import { type ReactNode, useEffect, useState } from 'react';
import { ClockDisplay } from '@/components/chess/ClockDisplay';
import { Badge, Card, LinkButton } from '@/components/ui';
import { useTicker } from '@/lib/useTicker';
import { siteConfig } from '@/site.config';
import { clockRemaining, formatTimeLeft, monotonicNow } from './liveView';
import type { LiveClock, LivePlayer, Side } from './types';
import './live.css';

/**
 * Pieces of a live game's page that the player's board (LiveGamePage) and the
 * watcher's (WatchGame) share: a player's name in their bar, their clock (or a
 * correspondence game's days), and the page for a game that is not there.
 */

/** Under this much time on a clock, it shows as low (and the player's own warns once). */
export const LOW_TIME_MS = 10_000;

export function PlayerName({
  player,
  you,
  left,
}: {
  player: LivePlayer;
  you: boolean;
  left: boolean;
}) {
  return (
    // The spaces between the parts are for screen readers and copied text; the flex gap spaces
    // them on screen.
    <span className="live-game__player">
      {player.title ? <span className="live-game__ptitle">{player.title}</span> : null}{' '}
      <span>{player.name}</span>
      {you ? <span className="sr-only"> (you)</span> : null}{' '}
      {player.rating !== null ? <span className="live-game__rating">{player.rating}</span> : null}{' '}
      {left ? <Badge tone="warning">Left</Badge> : null}
    </span>
  );
}

/** A game that cannot be shown: why, and the way back to Play. */
export function GameAbsent({
  title,
  children,
  lichess = false,
}: {
  title: string;
  children: ReactNode;
  lichess?: boolean;
}) {
  useEffect(() => {
    document.title = `Live game · ${siteConfig.name}`;
  }, []);
  return (
    <div className="narrow">
      <Card data-testid="live-absent">
        <h1 className="live-game__absent-title">{title}</h1>
        <p>{children}</p>
        <div className="row">
          <LinkButton variant="primary" to="/play">
            Back to Play
          </LinkButton>
          {lichess ? <LinkButton to="/settings#lichess">Lichess in Settings</LinkButton> : null}
        </div>
      </Card>
    </div>
  );
}

/**
 * A correspondence game's time for the side to move, in days and hours ("2 days
 * 5 h"), brought up to date every half minute; nothing for the other side.
 */
export function DaysLeft({ clock, side, live }: { clock: LiveClock; side: Side; live: boolean }) {
  const running = live && clock.running === side;
  const [now, setNow] = useState(monotonicNow);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(monotonicNow()), 30_000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!running) return null;
  const ms = clockRemaining(clock, side, Math.max(now, clock.at));
  return (
    <span className="live-game__days" data-testid="live-days-left">
      <span className="sr-only">Time left: </span>
      {formatTimeLeft(ms)}
    </span>
  );
}

/** One side's clock: only the running one ticks (five times a second, with the shared ticker). */
export function LiveClockDisplay({
  clock,
  side,
  live,
  onLow,
}: {
  clock: LiveClock;
  side: Side;
  live: boolean;
  onLow?: () => void;
}) {
  const running = live && clock.running === side;
  useTicker(running);
  const ms = clockRemaining(clock, side, running ? monotonicNow() : clock.at);
  const low = running && ms <= LOW_TIME_MS;
  useEffect(() => {
    if (low) onLow?.();
  }, [low, onLow]);
  return <ClockDisplay ms={ms} running={running} lowTimeMs={LOW_TIME_MS} />;
}
