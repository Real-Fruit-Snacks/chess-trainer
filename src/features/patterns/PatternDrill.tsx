import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, LinkButton } from '@/components/ui';
import { type PuzzleOutcomeEvent, usePuzzleTrainer } from '@/features/puzzles/usePuzzleTrainer';
import { shortcutKey } from '@/lib/shortcutKey';
import { useProgress } from '@/store/progress';
import { type MatingPattern, patternDrillId, patternPuzzle } from './matingPatterns';
import { Notated } from '@/chess/San';

export const PATTERN_DRILL_ID = 'mating-patterns';

export type PatternResult = 'solved' | 'failed';

/**
 * Solves the patterns one after another: the defender's move is played, then
 * the learner has to find the mate. Each pattern's result is remembered, and a
 * full run is scored on the Drills page.
 */
export function PatternDrill({
  patterns,
  onExit,
}: {
  patterns: MatingPattern[];
  onExit: () => void;
}) {
  const recordDrill = useProgress((s) => s.recordDrill);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, PatternResult>>({});
  const [finished, setFinished] = useState(false);
  const current = patterns[index] ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;

  const onOutcome = useCallback(
    (event: PuzzleOutcomeEvent) => {
      const pattern = currentRef.current;
      if (!pattern) return;
      const outcome: PatternResult = event.outcome;
      setResults((r) => ({ ...r, [pattern.id]: outcome }));
      recordDrill(
        patternDrillId(pattern),
        outcome === 'solved' ? (event.hintUsed ? 50 : 100) : 0,
        outcome === 'solved' ? (event.hintUsed ? 'Solved with a hint' : 'Solved') : undefined,
      );
    },
    [recordDrill],
  );
  const trainer = usePuzzleTrainer(onOutcome);
  const { load } = trainer;

  useEffect(() => {
    if (current) load(patternPuzzle(current));
  }, [current, load]);

  const solved = Object.values(results).filter((r) => r === 'solved').length;
  const total = patterns.length;

  const next = () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      return;
    }
    setFinished(true);
    if (total > 1) {
      recordDrill(
        PATTERN_DRILL_ID,
        Math.round((solved / total) * 100),
        `${solved}/${total} patterns`,
      );
    }
  };

  // Keyboard: Enter for the next pattern once this one is over (not from a focused button,
  // which Enter activates anyway, nor from the board or with a modifier held).
  useEffect(() => {
    if (finished || (trainer.phase !== 'solved' && trainer.phase !== 'failed')) return;
    const onKey = (e: KeyboardEvent) => {
      if (shortcutKey(e) === 'Enter') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const solverIsMoving = trainer.phase === 'solving';
  const over = trainer.phase === 'solved' || trainer.phase === 'failed';

  if (finished || !current) {
    const missed = patterns.filter((p) => results[p.id] !== 'solved');
    return (
      <Card data-testid="pattern-summary">
        <p className="card__eyebrow">Pattern drill</p>
        <h2 style={{ margin: '4px 0' }}>
          You found {solved} of {total} mate{total === 1 ? '' : 's'}
        </h2>
        {missed.length > 0 ? (
          <p className="small muted">To look at again: {missed.map((p) => p.name).join(', ')}.</p>
        ) : (
          <p className="small muted">Every pattern found — now spot them in real games.</p>
        )}
        <div className="row">
          <Button variant="primary" onClick={onExit}>
            Back to the gallery
          </Button>
          <LinkButton to="/puzzles/themes?theme=mate">Mate puzzles</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="trainer" data-testid="pattern-drill">
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={trainer.position.fen}
          orientation={trainer.solverColor}
          turnColor={trainer.position.turn}
          movableColor={solverIsMoving ? trainer.solverColor : undefined}
          dests={solverIsMoving ? trainer.position.dests : new Map()}
          lastMove={trainer.position.lastMove}
          check={trainer.position.check}
          highlights={trainer.highlights}
          shapes={trainer.shapes}
          // Promotions always ask: a pattern may need a specific piece.
          onMove={(from, to) => trainer.playUserMove(from, to)}
          ariaLabel={`${current.name} drill board, ${trainer.position.turn} to move`}
        />
        {trainer.needsPromotion ? (
          <PromotionPicker color={trainer.solverColor} onSelect={trainer.resolvePromotion} />
        ) : null}
      </div>
      <aside className="trainer__panel stack">
        <Card>
          <div className="row row--between">
            <span className="card__eyebrow">
              Pattern {index + 1} of {total}
            </span>
            <Badge>
              {solved} found
              {Object.keys(results).length - solved > 0
                ? ` · ${Object.keys(results).length - solved} missed`
                : ''}
            </Badge>
          </div>
          <h2 style={{ margin: '4px 0 8px' }} data-testid="pattern-title">
            {over ? current.name : 'Which mate is this?'}
          </h2>
          <p className={`puzzle-status puzzle-status--${trainer.phase}`} role="status">
            {trainer.phase === 'intro'
              ? 'Watch the defender’s move…'
              : trainer.phase === 'solving'
                ? `${trainer.solverColor === 'white' ? 'White' : 'Black'} to play and mate${trainer.position.total > 1 ? ` in ${trainer.position.total}` : ''}.`
                : trainer.phase === 'replying'
                  ? 'The defender replies…'
                  : trainer.phase === 'solved'
                    ? results[current.id] === 'solved'
                      ? `Mate — the ${current.name}.`
                      : `That is the ${current.name}.`
                    : `Not that — look for the ${current.name}.`}
          </p>
          {over ? (
            <p className="small muted" style={{ margin: '0 0 8px' }}>
              <Notated text={current.explanation} />
            </p>
          ) : null}
          <div className="puzzle-actions">
            {trainer.phase === 'solving' ? (
              <>
                <Button onClick={trainer.hint}>Hint</Button>
                <Button onClick={trainer.showSolution} data-testid="pattern-solution">
                  Solution
                </Button>
              </>
            ) : null}
            {trainer.phase === 'failed' ? (
              <>
                <Button onClick={trainer.retry}>Try again</Button>
                <Button onClick={trainer.showSolution} data-testid="pattern-solution">
                  Solution
                </Button>
              </>
            ) : null}
            {over ? (
              <Button variant="primary" onClick={next} data-testid="pattern-next">
                {index + 1 < total ? 'Next pattern' : 'Finish'}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onExit}>
              Exit
            </Button>
          </div>
        </Card>
      </aside>
    </div>
  );
}
