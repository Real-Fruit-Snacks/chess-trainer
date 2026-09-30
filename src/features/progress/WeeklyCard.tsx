import { useMemo } from 'react';
import { Card } from '@/components/ui';
import { useNow } from '@/lib/useNow';
import { useProgress } from '@/store/progress';
import { type WeekFigures, weeklySummary } from './weeklySummary';

const ROWS: { key: keyof WeekFigures; label: string; suffix?: string }[] = [
  { key: 'puzzlesSolved', label: 'Puzzles solved' },
  { key: 'accuracy', label: 'Puzzle accuracy', suffix: '%' },
  { key: 'lessonsCompleted', label: 'Lessons completed' },
  { key: 'gamesPlayed', label: 'Games vs the engine' },
  { key: 'drills', label: 'Drills' },
  { key: 'trainingDays', label: 'Training days' },
  { key: 'ratingChange', label: 'Rating change' },
];

function show(value: number | null, suffix = ''): string {
  if (value === null) return '—';
  return `${value}${suffix}`;
}

/** This week against last week: a quick sense of momentum. */
export function WeeklyCard() {
  const progress = useProgress();
  const now = useNow(5 * 60_000);
  const summary = useMemo(() => weeklySummary(progress, now), [progress, now]);
  const any =
    summary.thisWeek.puzzlesAttempted +
      summary.lastWeek.puzzlesAttempted +
      summary.thisWeek.trainingDays +
      summary.lastWeek.trainingDays >
    0;
  return (
    <Card>
      <h2 style={{ fontSize: '1.15rem' }}>This week</h2>
      {!any ? (
        <p className="small muted">Train a little and the last seven days will show up here.</p>
      ) : (
        <table className="history" data-testid="weekly-summary">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">
                Last 7 days
              </th>
              <th scope="col" className="num">
                7 days before
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const a = summary.thisWeek[row.key];
              const b = summary.lastWeek[row.key];
              const up = a !== null && b !== null && a > b;
              const down = a !== null && b !== null && a < b;
              return (
                <tr key={row.key}>
                  <th scope="row" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {row.label}
                  </th>
                  <td
                    className={`num ${up ? 'puzzle-delta--up' : down ? 'puzzle-delta--down' : ''}`}
                  >
                    {show(a, row.suffix)}
                  </td>
                  <td className="num muted">{show(b, row.suffix)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
