import { Link } from 'react-router';
import { Card, Stat } from '@/components/ui';
import { BLIND_DEPTH_LABELS, BLIND_DEPTHS } from '@/features/puzzles/blind';
import { NONE } from '@/lib/format';
import { useProgress } from '@/store/progress';

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((100 * part) / whole)}%` : NONE;

/**
 * The habits behind good moves, each with its own record: naming threats,
 * calculating without the board, finding a game's turning points before the
 * engine, and the moves the blunder check held back.
 */
export function ThinkingSkillsCard() {
  const threats = useProgress((s) => s.threatStats);
  const blind = useProgress((s) => s.blind);
  const selfReview = useProgress((s) => s.selfReview);
  const blunderChecks = useProgress((s) => s.blunderChecks);
  const named = threats.found + threats.missed;
  const levels = BLIND_DEPTHS.filter((depth) => typeof blind.levels[depth] === 'number');
  const recent = selfReview.history.slice(-5);
  const nothingYet =
    named === 0 &&
    blind.solved + blind.failed === 0 &&
    selfReview.games === 0 &&
    blunderChecks.stopped === 0;

  return (
    <Card data-testid="thinking-skills">
      <h2 style={{ fontSize: '1.15rem' }}>Thinking skills</h2>
      {nothingYet ? (
        <p className="small muted" style={{ margin: 0 }}>
          The habits behind good moves: name your opponent’s threat before you move, calculate a
          line without moving the pieces, and find a game’s turning points before the engine shows
          them. Your records appear here.
        </p>
      ) : (
        <div className="stats">
          <Stat value={percent(threats.found, named)} label={`Threats named · ${named} tried`} />
          <Stat
            value={percent(threats.defended, threats.defenceTried)}
            label={`Threats met · ${threats.defenceTried} tried`}
          />
          {levels.map((depth) => (
            <Stat
              key={depth}
              value={blind.levels[depth] ?? NONE}
              label={`Blind level · ${BLIND_DEPTH_LABELS[depth]}`}
            />
          ))}
          <Stat
            value={percent(selfReview.found, selfReview.total)}
            label={`Turning points caught · ${selfReview.games} game${selfReview.games === 1 ? '' : 's'}`}
          />
          <Stat value={blunderChecks.stopped} label="Moves the blunder check held back" />
        </div>
      )}
      {recent.length > 1 ? (
        <p className="small muted" style={{ margin: '12px 0 0' }} data-testid="self-review-trend">
          Your last self-analyses:{' '}
          {recent.map((h) => (h.total ? `${h.found}/${h.total}` : NONE)).join(' · ')}
        </p>
      ) : null}
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        <Link to="/drills/threats">What’s the threat?</Link> ·{' '}
        <Link to="/puzzles/blind">Blind puzzles</Link> ·{' '}
        <Link to="/games">Analyze a game yourself</Link>
      </p>
    </Card>
  );
}
