import { useLiveBar } from '@/app/liveBar';

/**
 * Whether the live-games bar has something to say, from the two things that
 * can give it a reason: the waiting room (a game posted, or just paired) and
 * the games in progress. Each says its part here; the bar shows while either
 * has something. Kept apart so each part can say so without loading the other.
 */
export type BarReason = 'lobby' | 'games';

const reasons: Record<BarReason, boolean> = { lobby: false, games: false };

export function setBarReason(reason: BarReason, active: boolean): void {
  reasons[reason] = active;
  const on = reasons.lobby || reasons.games;
  if (useLiveBar.getState().active !== on) useLiveBar.getState().set(on);
}
