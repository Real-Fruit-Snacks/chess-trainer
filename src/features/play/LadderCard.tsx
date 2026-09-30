import { Button, Card } from '@/components/ui';
import { useProgress } from '@/store/progress';
import { buildEngineLadder } from './ladder';

/**
 * The engine ladder on the Play page: which levels are beaten, which one is
 * next, and a one-click game at it.
 */
export function LadderCard({ onPlay }: { onPlay: (levelId: number) => void }) {
  const games = useProgress((s) => s.games);
  const ladder = buildEngineLadder(games);
  return (
    <Card data-testid="engine-ladder">
      <p className="card__eyebrow">Engine ladder</p>
      <div className="ladder__rungs" role="list" aria-label="Engine levels">
        {ladder.rungs.map((rung) => (
          <span
            key={rung.level.id}
            role="listitem"
            className={`ladder__rung ladder__rung--${rung.status}`}
            title={`Level ${rung.level.id} · ${rung.level.name}: ${rung.wins} wins, ${rung.draws} draws, ${rung.losses} losses`}
          >
            {rung.level.id}
          </span>
        ))}
      </div>
      <p className="small muted" style={{ margin: '8px 0' }} data-testid="ladder-reason">
        {ladder.reason}
      </p>
      <Button size="sm" variant="primary" onClick={() => onPlay(ladder.next.id)}>
        Play Level {ladder.next.id} · {ladder.next.name}
      </Button>
    </Card>
  );
}
