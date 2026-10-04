import { Link } from 'react-router';
import { Card, Icon } from '@/components/ui';
import { ARCADE_GAMES, describeArcadeBest } from '@/features/arcade/games';
import { useProgress } from '@/store/progress';

/** Best results in the arcade games, one line per game played. */
export function ArcadeCard() {
  const arcade = useProgress((s) => s.arcade);
  const dailyOpening = useProgress((s) => s.dailyOpening);
  const oddsLadder = useProgress((s) => s.oddsLadder);
  const rows = ARCADE_GAMES.map((game) => ({
    game,
    best: describeArcadeBest(game, { arcade, dailyOpening, oddsLadder }),
  })).filter((row) => row.best !== null);
  if (rows.length === 0) return null;
  return (
    <Card data-testid="arcade-results">
      <h2 style={{ fontSize: '1.15rem' }}>Arcade</h2>
      <ul className="arcade-results" role="list">
        {rows.map(({ game, best }) => (
          <li key={game.id} className="arcade-results__row">
            <span className="arcade-results__icon">
              <Icon name={game.icon} size={18} />
            </span>
            <span>
              <Link to={`/arcade/${game.id}`}>{game.name}</Link>
              <span className="small muted"> · {best}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
