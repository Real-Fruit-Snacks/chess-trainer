import { ENGINE_LEVELS } from '@/engine/levels';
import { buildInsights } from '@/features/games/insights';
import type { GameRecord } from '@/store/progress';

/** Wins, draws and losses against each engine level, as stacked bars. */
export function LevelResults({ games }: { games: GameRecord[] }) {
  const levels = buildInsights([], '', games).levels;
  if (levels.length === 0) return null;
  return (
    <div className="levels" data-testid="level-results">
      {levels.map((row) => {
        const level = ENGINE_LEVELS.find((l) => l.id === row.level);
        const pct = (n: number) => `${(n / row.games) * 100}%`;
        return (
          <div key={row.level} className="levels__row">
            <span className="levels__label">
              Level {row.level}
              {level ? ` · ${level.name}` : ''}
            </span>
            <div
              className="levels__bar"
              role="img"
              aria-label={`${row.wins} wins, ${row.draws} draws, ${row.losses} losses in ${row.games} games`}
            >
              <span className="levels__win" style={{ width: pct(row.wins) }} />
              <span className="levels__draw" style={{ width: pct(row.draws) }} />
              <span className="levels__loss" style={{ width: pct(row.losses) }} />
            </div>
            <span className="levels__score small muted">
              {row.wins}–{row.draws}–{row.losses}
            </span>
          </div>
        );
      })}
    </div>
  );
}
