import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Stat } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { formatDate } from '@/lib/dates';
import { decodeShare, shareUrl } from '@/lib/shareCodes';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { chooseWoodpeckerPuzzles } from './chooseWoodpeckerPuzzles';
import {
  cycleStats,
  describeImprovement,
  nextCycleDue,
  WOODPECKER_SIZES,
  WOODPECKER_TARGET_CYCLES,
  type WoodpeckerSize,
} from './woodpecker';

/**
 * The Woodpecker card: start a set, see the cycles so far, and continue or
 * start the next cycle. The solving itself happens in the shared trainer.
 */
export function WoodpeckerPanel({ onContinue }: { onContinue: () => void }) {
  const set = useProgress((s) => s.woodpecker);
  const rating = useProgress((s) => s.puzzleRating);
  const startWoodpecker = useProgress((s) => s.startWoodpecker);
  const startCycle = useProgress((s) => s.startWoodpeckerCycle);
  const abandon = useProgress((s) => s.abandonWoodpecker);
  const [size, setSize] = useState<WoodpeckerSize>(100);
  const [building, setBuilding] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [shared, setShared] = useState<{ puzzleIds: string[]; rating: number } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // A shared set (`#wp=…`): offer to take it over, replacing any current set.
  useEffect(() => {
    if (!location.hash) return;
    let cancelled = false;
    void decodeShare(location.hash).then((payload) => {
      if (cancelled) return;
      if (payload?.kind === 'woodpecker' && payload.puzzleIds.length >= 10) setShared(payload);
      else toast('That link does not contain a Woodpecker set.', { tone: 'warning' });
      void navigate(location.pathname, { replace: true });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the fragment matters
  }, [location.hash]);

  const acceptShared = () => {
    if (!shared) return;
    startWoodpecker(shared.puzzleIds, shared.rating);
    setShared(null);
    toast(`Shared set of ${shared.puzzleIds.length} puzzles ready. Cycle 1 starts now.`, {
      tone: 'success',
    });
    onContinue();
  };

  const share = async () => {
    if (!set) return;
    const url = await shareUrl('/puzzles/woodpecker', {
      kind: 'woodpecker',
      puzzleIds: set.puzzleIds,
      rating: set.rating,
    });
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — it gives whoever opens it the same set of puzzles.', {
        tone: 'success',
      });
    } catch {
      toast('Could not copy the link.', { tone: 'warning' });
    }
  };

  const sharedOffer = shared ? (
    <Alert tone="info">
      <div data-testid="shared-woodpecker">
        A friend shared a Woodpecker set of {shared.puzzleIds.length} puzzles (around rating{' '}
        {Math.round(shared.rating)}).{set ? ' Taking it replaces your current set.' : ''}{' '}
        <div className="row" style={{ marginTop: 8 }}>
          <Button size="sm" variant="primary" onClick={acceptShared}>
            Take this set
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShared(null)}>
            Ignore
          </Button>
        </div>
      </div>
    </Alert>
  ) : null;

  const start = async () => {
    setBuilding(true);
    try {
      const ids = await chooseWoodpeckerPuzzles(size, rating);
      if (ids.length < 10) throw new Error('Not enough puzzles available for a set.');
      startWoodpecker(ids, rating);
      toast(`Set of ${ids.length} puzzles ready. Cycle 1 starts now.`, { tone: 'success' });
      onContinue();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), { tone: 'danger' });
    } finally {
      setBuilding(false);
    }
  };

  if (!set) {
    return (
      <Card className="rush__start" data-testid="woodpecker-start">
        {sharedOffer}
        <p className="card__eyebrow">The Woodpecker method</p>
        <h2 style={{ marginTop: 4 }}>One set, solved seven times</h2>
        <p className="muted">
          Pick a fixed set of puzzles at your level and solve it in cycles, each one faster than the
          last, until the patterns are automatic. The set is chosen once; every cycle records your
          time and accuracy so you can see the improvement.
        </p>
        <div className="row" style={{ justifyContent: 'center', margin: '12px 0' }}>
          {WOODPECKER_SIZES.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={n === size ? 'primary' : 'secondary'}
              onClick={() => setSize(n)}
              aria-pressed={n === size}
            >
              {n} puzzles
            </Button>
          ))}
        </div>
        <Button variant="primary" size="lg" onClick={() => void start()} disabled={building}>
          {building ? 'Choosing puzzles…' : `Start a set of ${size}`}
        </Button>
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Around your rating of {Math.round(rating)}. Woodpecker solving is unrated.
        </p>
      </Card>
    );
  }

  const stats = cycleStats(set);
  const due = nextCycleDue(set);
  const done = set.cycles.length >= WOODPECKER_TARGET_CYCLES;
  const improvement = describeImprovement(set);

  return (
    <Card data-testid="woodpecker-panel">
      {sharedOffer}
      <div className="row row--between">
        <div>
          <p className="card__eyebrow">Woodpecker set · {set.puzzleIds.length} puzzles</p>
          <h2 style={{ margin: '4px 0' }}>
            {set.current
              ? `Cycle ${set.current.cycle}: puzzle ${set.current.index + 1} of ${set.puzzleIds.length}`
              : done
                ? 'Set complete'
                : `${set.cycles.length} cycle${set.cycles.length === 1 ? '' : 's'} done`}
          </h2>
        </div>
        <div className="row">
          {set.current ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onContinue}
              data-testid="woodpecker-continue"
            >
              Continue
            </Button>
          ) : !done ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                startCycle();
                onContinue();
              }}
              data-testid="woodpecker-next-cycle"
            >
              Start cycle {set.cycles.length + 1}
            </Button>
          ) : null}
        </div>
      </div>
      {set.current ? (
        <div className="puzzle-stats" style={{ marginTop: 8 }}>
          <Stat value={set.current.solved} label="Solved this cycle" />
          <Stat value={set.current.failed} label="Missed" />
          <Stat value={`${Math.round(set.current.timeMs / 60_000)} min`} label="Time" />
        </div>
      ) : null}
      {due && !set.current ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Next cycle suggested {formatDate(due, siteConfig.locale)} — starting earlier is fine.
        </p>
      ) : null}
      {improvement ? (
        <Alert tone="success">
          <span data-testid="woodpecker-improvement">{improvement}</span>
        </Alert>
      ) : null}
      {stats.length ? (
        <table className="history" style={{ marginTop: 8 }} data-testid="woodpecker-cycles">
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Per puzzle</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((c) => (
              <tr key={c.cycle}>
                <td>{c.cycle}</td>
                <td>{c.accuracy}%</td>
                <td>{c.pace}s</td>
                <td>{c.minutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        {confirmAbandon ? (
          <>
            <span className="small muted">Drop this set and its history?</span>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                abandon();
                setConfirmAbandon(false);
              }}
            >
              Drop the set
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmAbandon(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => void share()}>
              Share this set
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmAbandon(true)}>
              {done ? 'Start a new set' : 'Drop this set'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
