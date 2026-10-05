import { ENGINE_LEVELS } from '@/engine/levels';
import { buildInsights } from '@/features/games/insights';
import type { GameRecord } from '@/store/progress';

interface ResultRow {
  key: string;
  label: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

/**
 * Wins, draws and losses against each engine level, then against the
 * human-like opponent at each rating played, as stacked bars.
 */
export function LevelResults({ games }: { games: GameRecord[] }) {
  const { levels, ratings } = buildInsights([], '', games);
  const rows: ResultRow[] = [
    ...levels.map((row) => {
      const level = ENGINE_LEVELS.find((l) => l.id === row.level);
      return {
        ...row,
        key: `level-${row.level}`,
        label: `Level ${row.level}${level ? ` · ${level.name}` : ''}`,
      };
    }),
    ...ratings.map((row) => ({
      ...row,
      key: `rating-${row.rating}`,
      label: `Human-like · ${row.rating}`,
    })),
  ];
  if (rows.length === 0) return null;
  return (
    <div className="levels" data-testid="level-results">
      {rows.map((row) => {
        const pct = (n: number) => `${(n / row.games) * 100}%`;
        return (
          <div key={row.key} className="levels__row">
            <span className="levels__label">{row.label}</span>
            <div
              className="levels__bar"
              role="img"
              aria-label={`${row.label}: ${row.wins} wins, ${row.draws} draws, ${row.losses} losses in ${row.games} games`}
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
