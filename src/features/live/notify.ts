import { type Notice, showNotice } from '@/features/notifications/notices';
import { useSettings } from '@/store/settings';
import { playUci, replay } from '../../../relay/src/live/rules.mjs';
import { isCorrespondence } from '../../../relay/src/live/shared.mjs';
import { endSummary, opponentOf } from './liveView';
import { liveGamePath } from './seats';
import type { LiveGameView, Pairing, Side } from './types';

/**
 * Notices from the games this device plays, for while the app is in the
 * background (a page in view shows none: notices.ts): the opponent's move, the
 * end of the game, a correspondence invitation taken, and a posted game that
 * someone took. Settings → Notifications: correspondence games follow their
 * own switch, every other game the live games' one. (A correspondence player
 * whose app is closed hears from the relay instead: room.mjs pushes them.)
 */

/** A game as its notices last saw it. */
export interface Seen {
  plies: number;
  status: LiveGameView['status'];
  open: Side | null;
}

/** An app path ("/play/online/<id>") as a notice names it: from the app's root. */
const fromRoot = (path: string) => path.replace(/^\/+/, '');

/** Whether the notices of a game with this time control are on (null: a duel's). */
function noticesOn(tc: string | null): boolean {
  const settings = useSettings.getState();
  return tc !== null && isCorrespondence(tc) ? settings.notifyCorrespondence : settings.notifyLive;
}

/** The last move: its SAN and who played it; null when the moves do not replay. */
function lastMove(
  view: Pick<LiveGameView, 'moves' | 'startFen'>,
): { san: string; by: Side } | null {
  const uci = view.moves.at(-1);
  const before = uci ? replay(view.moves.slice(0, -1), view.startFen) : null;
  if (!uci || !before) return null;
  const by: Side = before.turn() === 'w' ? 'white' : 'black';
  const move = playUci(before, uci);
  return move ? { san: move.san, by } : null;
}

/** What has happened in the game since `seen` that is worth a notice, if anything. */
export function gameNotice(seen: Seen, view: LiveGameView): Notice | null {
  const opponent = opponentOf(view).name;
  const page = { url: fromRoot(liveGamePath(view.source, view.id, view.game)), tag: view.id };
  if (seen.status !== 'over' && view.status === 'over') {
    return {
      ...page,
      title: opponent ? `Game over against ${opponent}` : 'Your invitation',
      body: endSummary(view, opponent),
    };
  }
  if (view.status !== 'playing') return null;
  if (seen.open !== null && view.open === null) {
    return {
      ...page,
      title: `${opponent} took your invitation`,
      body:
        view.you === 'white'
          ? 'The game is on: your move.'
          : `The game is on: ${opponent} moves first.`,
    };
  }
  if (view.moves.length > seen.plies) {
    const last = lastMove(view);
    if (last && last.by !== view.you) {
      return {
        ...page,
        title: `Your move against ${opponent}`,
        body: `${opponent} played ${last.san}.`,
      };
    }
  }
  return null;
}

/**
 * Follows one game's views and shows a notice for each change worth one. The
 * game as it stood when it loaded is news to nobody: it tells nothing.
 */
export function gameNotices(): (view: LiveGameView) => void {
  let seen: Seen | null = null;
  return (view) => {
    if (view.watching || view.missing || view.connection === 'connecting') return;
    const before = seen;
    seen = { plies: view.moves.length, status: view.status, open: view.open };
    if (!before || !noticesOn(view.tc)) return;
    const notice = gameNotice(before, view);
    if (notice) void showNotice(notice);
  };
}

/** The waiting room paired this device's post: the game is on. */
export function pairingNotice(pairing: Pairing): void {
  if (!noticesOn(pairing.tc)) return;
  void showNotice({
    title: 'Your game is on',
    body: `${pairing.opponent.name} took your game.`,
    url: fromRoot(pairing.path),
    tag: pairing.game,
  });
}
