import { useLiveBar } from '@/app/liveBar';

/**
 * Whether the live-games bar has something to say, from the things that can
 * give it a reason: the waiting room (a game posted, or just paired), the
 * games in progress, the correspondence games where it is your move, and the
 * group rooms the player is in (race rooms, analysis rooms). Each says its part here; the bar shows while
 * any has something. Kept apart so each part can say so without loading the
 * others.
 */
export type BarReason = 'lobby' | 'games' | 'corr' | 'rooms';

const reasons: Record<BarReason, boolean> = {
  lobby: false,
  games: false,
  corr: false,
  rooms: false,
};

export function setBarReason(reason: BarReason, active: boolean): void {
  reasons[reason] = active;
  const on = reasons.lobby || reasons.games || reasons.corr || reasons.rooms;
  if (useLiveBar.getState().active !== on) useLiveBar.getState().set(on);
}
