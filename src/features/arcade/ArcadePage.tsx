import { useEffect } from 'react';
import { Link } from 'react-router';
import { Badge, Icon, LinkButton } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { ARCADE_GAMES, describeArcadeBest } from './games';
import './arcade.css';

/** The arcade: nine games that are not puzzles, each with a score to beat. */
export default function ArcadePage() {
  const arcade = useProgress((s) => s.arcade);
  const dailyOpening = useProgress((s) => s.dailyOpening);
  const oddsLadder = useProgress((s) => s.oddsLadder);

  useEffect(() => {
    document.title = `Arcade · ${siteConfig.name}`;
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Arcade</h1>
        <p>
          Nine games that are not puzzles: play with the engine as your partner, guess the opening
          of the day, judge positions, climb the odds ladder, draft an army, hold a fortress, replay
          lines from memory, play blindfold, or take on several engines at once. Every game keeps a
          score to beat.
        </p>
      </div>
      <div className="grid grid--cards" data-testid="arcade-games">
        {ARCADE_GAMES.map((game) => {
          const best = describeArcadeBest(game, { arcade, dailyOpening, oddsLadder });
          return (
            <div key={game.id} className="card arcade-card" data-testid={`arcade-${game.id}`}>
              <div className="row row--between">
                <span className="arcade-card__icon">
                  <Icon name={game.icon} size={24} />
                </span>
                <span className="row arcade-card__meta">
                  <Badge>{game.minutes} min</Badge>
                  {game.engine ? <Badge tone="accent">Engine</Badge> : null}
                </span>
              </div>
              <Link to={`/arcade/${game.id}`} className="card__title">
                {game.name}
              </Link>
              <p className="arcade-card__tagline">{game.tagline}</p>
              <p className="small muted" style={{ margin: 0 }}>
                {game.description}
              </p>
              <p className="small" style={{ margin: 0 }}>
                <strong>Trains:</strong> {game.trains}
              </p>
              <div className="row row--between arcade-card__footer">
                <span className="small muted" data-testid={`arcade-best-${game.id}`}>
                  {best ?? 'Not played yet'}
                </span>
                <LinkButton
                  variant="primary"
                  size="sm"
                  to={`/arcade/${game.id}`}
                  aria-label={`Play ${game.name}`}
                >
                  Play
                </LinkButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
