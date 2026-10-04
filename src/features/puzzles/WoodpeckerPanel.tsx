import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Button, Card, ConfirmDialog, Dialog, ScrollRegion, Stat } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { formatDate } from '@/lib/dates';
import { readShare, shareUrl } from '@/lib/shareCodes';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { chooseWoodpeckerPuzzles } from './chooseWoodpeckerPuzzles';
import {
  MIN_SHARED_WOODPECKER,
  type ValidatedWoodpeckerSet,
  validateSharedWoodpecker,
} from './sharedWoodpecker';
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
  const [shared, setShared] = useState<ValidatedWoodpeckerSet | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // A shared set (`#wp=…`): check it against the bundled puzzles, then offer to take it over.
  // The fragment is cleared only once the check is done: clearing it re-runs this
  // effect, which would cancel a check still waiting for the puzzle files.
  useEffect(() => {
    if (!location.hash) return;
    let cancelled = false;
    const clearFragment = () => void navigate(location.pathname, { replace: true });
    void (async () => {
      const read = await readShare(location.hash);
      if (cancelled) return;
      if (!read.ok || read.payload.kind !== 'woodpecker') {
        toast(
          !read.ok && read.kind === 'unsupported'
            ? 'This browser cannot open compressed links, so the shared set cannot be read here.'
            : !read.ok && read.kind === 'too-large'
              ? 'That link is too large to be a Woodpecker set.'
              : 'That link does not contain a Woodpecker set.',
          { tone: 'warning' },
        );
        clearFragment();
        return;
      }
      const payload = read.payload;
      try {
        const checked = await validateSharedWoodpecker(payload.puzzleIds, payload.rating);
        if (cancelled) return;
        if (!checked) {
          toast(
            `That link holds fewer than ${MIN_SHARED_WOODPECKER} puzzles from the bundled set, so it cannot be used.`,
            { tone: 'warning' },
          );
        } else {
          setShared(checked);
        }
      } catch (err) {
        if (!cancelled) toast(err instanceof Error ? err.message : String(err), { tone: 'danger' });
      } finally {
        if (!cancelled) clearFragment();
      }
    })();
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

  const sharedOffer = (
    <Dialog
      open={shared !== null}
      onClose={() => setShared(null)}
      title="Take a shared Woodpecker set"
      actions={
        <>
          <Button variant="ghost" onClick={() => setShared(null)}>
            Not now
          </Button>
          <Button variant="primary" onClick={acceptShared} data-testid="accept-shared-woodpecker">
            Take this set
          </Button>
        </>
      }
    >
      {shared ? (
        <div data-testid="shared-woodpecker">
          <p>
            A friend shared a Woodpecker set of {shared.puzzleIds.length} puzzles (around rating{' '}
            {Math.round(shared.rating)}).{set ? ' Taking it replaces your current set.' : ''}
          </p>
          {shared.unknown > 0 ? (
            <p className="small muted">
              {shared.unknown} id{shared.unknown === 1 ? ' was' : 's were'} not in the bundled
              puzzles and {shared.unknown === 1 ? 'was' : 'were'} left out.
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );

  const start = async () => {
    setBuilding(true);
    try {
      const ids = await chooseWoodpeckerPuzzles(size, rating);
      if (ids.length < MIN_SHARED_WOODPECKER) {
        throw new Error('Not enough puzzles available for a set.');
      }
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
        // On a narrow phone the table scrolls inside the card instead of widening the page.
        <ScrollRegion label="Woodpecker cycles" style={{ marginTop: 8 }}>
          <table className="history" data-testid="woodpecker-cycles">
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
        </ScrollRegion>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        <Button size="sm" variant="ghost" onClick={() => void share()}>
          Share this set
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmAbandon(true)}>
          {done ? 'Start a new set' : 'Drop this set'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmAbandon}
        title={done ? 'Start a new set?' : 'Drop this set?'}
        confirmLabel={done ? 'Start a new set' : 'Drop the set'}
        danger
        onConfirm={abandon}
        onClose={() => setConfirmAbandon(false)}
      >
        {done
          ? 'The finished set and its cycle history are removed so a new set can be chosen.'
          : `The set and its ${set.cycles.length} recorded cycle${set.cycles.length === 1 ? '' : 's'} are removed. This cannot be undone.`}
      </ConfirmDialog>
    </Card>
  );
}
