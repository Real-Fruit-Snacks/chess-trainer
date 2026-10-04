import { useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { useProgress } from '@/store/progress';
import { buildEngineLadder, describeRung } from './ladder';

/**
 * The engine ladder on the Play page: which levels are beaten, which one is
 * next, and a one-click game at it.
 */
export function LadderCard({ onPlay }: { onPlay: (levelId: number) => void }) {
  const games = useProgress((s) => s.games);
  const knownHeight = useProgress((s) => s.ladderHeight);
  const setLadderHeight = useProgress((s) => s.setLadderHeight);
  const ladder = buildEngineLadder(games, knownHeight);
  // Remember the height so climbed rungs outlive the capped game list.
  useEffect(() => {
    if (ladder.height > knownHeight) setLadderHeight(ladder.height);
  }, [ladder.height, knownHeight, setLadderHeight]);
  return (
    <Card data-testid="engine-ladder">
      <p className="card__eyebrow">Engine ladder</p>
      {/* role="list": Safari drops the list semantics of a list styled without markers. */}
      <ol className="engine-ladder__rungs" role="list" aria-label="Ladder rungs">
        {ladder.rungs.map((rung) => (
          <li
            key={rung.level.id}
            className={`engine-ladder__rung engine-ladder__rung--${rung.status}`}
            aria-current={rung.status === 'current' ? 'step' : undefined}
            data-status={rung.status}
          >
            <span aria-hidden="true">{rung.level.id}</span>
            <span className="sr-only">{describeRung(rung)}</span>
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ margin: '8px 0' }} data-testid="ladder-reason">
        {ladder.reason}
      </p>
      <Button size="sm" variant="primary" onClick={() => onPlay(ladder.next.id)}>
        Play Level {ladder.next.id} · {ladder.next.name}
      </Button>
    </Card>
  );
}
