import { type ReactNode, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, Icon, LinkButton } from '@/components/ui';
import { useTicker } from '@/lib/useTicker';
import { formatElapsed } from './liveView';
import { useLobby } from './lobby';
import { gameName, gameNoun, isDuelKind } from './onlineGames';
import { checkOnLiveGames, useActiveGames } from './sessions';
import './live.css';

/**
 * The slim bar under the shell's header while live games need the player's
 * attention elsewhere in the app: a game just paired, a game in progress, a
 * game posted and waiting (in that order). Loaded only once the live-games code
 * turns `useLiveBar` on (see src/app/liveBar.ts). It never points at the page
 * it is on: Play shows what is posted and goes to a paired game by itself, and
 * a game's own page needs no way back to it.
 */
export default function LiveBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pairing = useLobby((s) => s.pairing);
  const mine = useLobby((s) => s.mine);
  const games = useActiveGames((s) => s.games);
  const here = pathname.replace(/\/+$/, '') || '/';
  const onPlay = here === '/play';
  const game = games.find((g) => g.path !== here);
  const waiting = !onPlay && !pairing && games.length === 0 && mine !== null;
  const now = useTicker(waiting);

  // Loaded at start-up only when a game may still be on since before it: find out (once).
  useEffect(() => checkOnLiveGames(), []);

  if (pairing && pairing.path !== here && !onPlay) {
    return (
      <Bar tone="paired">
        <p className="live-bar__text" role="status">
          {pairing.opponent.name} joined your {gameNoun(pairing.kind, pairing.tc)}.
        </p>
        <div className="live-bar__actions">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              void navigate(pairing.path);
              useLobby.getState().clearPairing();
            }}
          >
            {isDuelKind(pairing.kind) ? 'Go to the duel' : 'Go to the board'}
          </Button>
        </div>
      </Bar>
    );
  }

  // A pairing whose board is this page (the game page clears it), or Play, which goes there.
  if (pairing) return null;

  if (game) {
    const duel = isDuelKind(game.kind);
    return (
      <Bar tone="game">
        <p className="live-bar__text" role="status">
          Your {duel ? gameName(game.kind) : 'game'} against {game.opponent} is on.
        </p>
        <div className="live-bar__actions">
          <LinkButton size="sm" variant="primary" to={game.path}>
            {duel ? 'Back to the duel' : 'Back to the board'}
          </LinkButton>
        </div>
      </Bar>
    );
  }

  // Every game in progress is on this page, nothing is posted, or Play shows what is.
  if (!mine || games.length > 0 || onPlay) return null;

  return (
    <Bar tone="waiting">
      <p className="live-bar__text" role="status">
        Waiting for an opponent · {mine.game === 'chess' ? mine.tc : gameName(mine.game)}
      </p>
      {/* Outside the status: a time read out every second would drown everything else. */}
      <span className="live-bar__time" role="timer">
        {formatElapsed(now - mine.postedAt)}
      </span>
      <div className="live-bar__actions">
        <Button size="sm" onClick={() => useLobby.getState().cancel()}>
          Cancel
        </Button>
        <LinkButton size="sm" variant="ghost" to="/play">
          Play
        </LinkButton>
      </div>
    </Bar>
  );
}

function Bar({ tone, children }: { tone: 'paired' | 'game' | 'waiting'; children: ReactNode }) {
  return (
    <section className={`live-bar live-bar--${tone}`} aria-label="Live game" data-testid="live-bar">
      <div className="container live-bar__inner">
        <Icon name="people" size={18} className="live-bar__icon" />
        {children}
      </div>
    </section>
  );
}
