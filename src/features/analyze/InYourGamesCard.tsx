import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { San } from '@/chess/San';
import type { Fen } from '@/chess/types';
import { Badge, Button, Card, ProgressBar } from '@/components/ui';
import { learnerColor, outcomeFor } from '@/features/games/gameStats';
import { formatDate, formatPgnDate } from '@/lib/dates';
import { siteConfig } from '@/site.config';
import { sortedGames, type StoredGame, useGames } from '@/store/games';
import { nextMoves, type PositionHit } from './positionIndex';
import { usePositionIndex } from './usePositionIndex';
import './in-your-games.css';
import { formatCount } from '@/lib/format';

/** Games listed before "Show all". */
const SHOWN = 5;

const OUTCOME = {
  win: { label: 'Win', tone: 'success' },
  draw: { label: 'Draw', tone: 'neutral' },
  loss: { label: 'Loss', tone: 'danger' },
} as const;

function dateOf(game: StoredGame): string {
  return game.timestamp
    ? formatDate(game.timestamp, siteConfig.locale)
    : (formatPgnDate(game.date, siteConfig.locale) ?? 'Date unknown');
}

/**
 * "In your games": the games in My games that reached the position on the
 * board (the same pieces on the same squares, the same side to move), what
 * was played next in them and how often, and each game, opened at that move.
 */
export function InYourGamesCard({
  fen,
  onOpen,
}: {
  fen: Fen;
  /** Opens a game on the board at the position (`ply` plies in). */
  onOpen: (game: StoredGame, ply: number) => void;
}) {
  const stored = useGames((s) => s.games);
  const player = useGames((s) => s.player);
  const games = useMemo(() => sortedGames(stored), [stored]);
  const { index, progress, failed } = usePositionIndex(games, games.length > 0);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [fen]);

  const found = useMemo(() => {
    if (!index) return [];
    return index
      .find(fen)
      .map((hit) => ({ hit, game: stored[hit.gameId] }))
      .filter((f): f is { hit: PositionHit; game: StoredGame } => f.game !== undefined);
  }, [index, fen, stored]);
  const tally = useMemo(() => nextMoves(found.map((f) => f.hit)), [found]);
  const shown = showAll ? found : found.slice(0, SHOWN);

  return (
    <Card data-testid="in-your-games">
      <strong>In your games</strong>
      {games.length === 0 ? (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Import your games in <Link to="/games">My games</Link> to see which of them reached this
          position, and what was played next.
        </p>
      ) : failed ? (
        <p className="small muted" style={{ margin: '6px 0 0' }} role="status">
          Your games could not be searched.
        </p>
      ) : !index ? (
        <div className="stack-sm" style={{ marginTop: 6 }}>
          <p className="small muted" style={{ margin: 0 }} role="status">
            Looking through your {formatCount(games.length, siteConfig.locale)} game
            {games.length === 1 ? '' : 's'}…
          </p>
          {progress && progress.total > 0 ? (
            <ProgressBar
              value={progress.done}
              max={progress.total}
              label="Searching your games"
              valueText={`${progress.done} of ${progress.total} games`}
            />
          ) : null}
        </div>
      ) : found.length === 0 ? (
        <p className="small muted" style={{ margin: '6px 0 0' }} data-testid="in-your-games-none">
          None of your {formatCount(index.games, siteConfig.locale)} game
          {index.games === 1 ? '' : 's'} reached this position.
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: '6px 0 0' }} data-testid="in-your-games-count">
            {found.length === 1
              ? 'One of your games reached this position.'
              : `${formatCount(found.length, siteConfig.locale)} of your games reached this position.`}
          </p>
          <ul role="list" className="ingames__tally" aria-label="Played next">
            {tally.map(({ san, count }) => (
              <li key={san ?? 'end'} className="ingames__chip">
                {san ? <San san={san} /> : 'Game over'}{' '}
                <span className="ingames__count">
                  × {count}
                  <span className="sr-only"> game{count === 1 ? '' : 's'}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul role="list" className="ingames__list">
            {shown.map(({ hit, game }) => {
              const color = learnerColor(game, player);
              const outcome = color ? outcomeFor(game.result, color) : null;
              const opponent =
                color === 'white' ? game.black : color === 'black' ? game.white : null;
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    className="ingames__game"
                    onClick={() => onOpen(game, hit.ply)}
                    data-testid="in-your-games-game"
                  >
                    <span className="ingames__head">
                      <span className="ingames__players">
                        {opponent !== null ? `vs ${opponent}` : `${game.white} – ${game.black}`}
                      </span>
                      {outcome ? (
                        <Badge tone={OUTCOME[outcome].tone}>{OUTCOME[outcome].label}</Badge>
                      ) : (
                        <span className="small muted">{game.result}</span>
                      )}
                    </span>
                    <span className="small muted">
                      {dateOf(game)}
                      {color ? ` · you had ${color}` : ''} ·{' '}
                      {hit.next ? (
                        <>
                          then {hit.nextLabel} <San san={hit.next} />
                        </>
                      ) : (
                        'the game ended here'
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {found.length > SHOWN ? (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${formatCount(found.length, siteConfig.locale)}`}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}
