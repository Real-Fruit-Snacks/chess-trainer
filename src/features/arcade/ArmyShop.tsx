import { Button } from '@/components/ui';
import {
  ARMY_PIECES,
  ARMY_PRESETS,
  type Army,
  type ArmyPiece,
  armyCost,
  armyProblem,
  canAdd,
  describeArmy,
  describeBudget,
  EMPTY_ARMY,
  PIECE_COST,
  PIECE_NAME,
} from './army';
import './arcade.css';

/**
 * The army shop: a stepper for each kind of man, the presets that fit the
 * budget, and what stands in the way of fielding the army. Each change is
 * read out with the new total (the steppers are silent otherwise): `onChange`
 * gives the army and the words, and the page keeps both. Army Draft against
 * the engine and the online draft share it.
 */
export function ArmyShop({
  army,
  budget,
  news,
  onChange,
  heading = 'Your army',
  disabled = false,
}: {
  army: Army;
  budget: number;
  /** The last change in words, read out politely. */
  news: string;
  onChange: (army: Army, news: string) => void;
  heading?: string;
  /** The army is sent: nothing changes any more. */
  disabled?: boolean;
}) {
  const problem = armyProblem(army, budget);

  const add = (piece: ArmyPiece, delta: 1 | -1) => {
    if (delta > 0 && !canAdd(army, piece, budget)) return;
    const next = { ...army, [piece]: Math.max(0, army[piece] + delta) };
    if (next[piece] === army[piece]) return;
    onChange(next, `${PIECE_NAME[piece]}s: ${next[piece]}. ${describeBudget(next, budget)}`);
  };

  return (
    <>
      <div className="row row--between">
        <strong id="army-heading">{heading}</strong>
        <span className="arcade__budget" data-testid="army-budget" aria-hidden="true">
          {armyCost(army)} / {budget}
        </span>
      </div>
      <p className="sr-only" role="status" data-testid="army-budget-news">
        {news}
      </p>
      <div
        className="arcade__shop arcade__shop--spaced"
        data-testid="army-shop"
        role="group"
        aria-labelledby="army-heading"
        aria-describedby="army-budget-total"
      >
        <span id="army-budget-total" className="sr-only">
          {describeBudget(army, budget)}
        </span>
        {ARMY_PIECES.map((piece) => (
          <div key={piece} className="arcade__shop-item">
            <span>
              <strong>{PIECE_NAME[piece]}</strong>
              <span className="small muted"> · {PIECE_COST[piece]}</span>
            </span>
            <span className="arcade__shop-stepper">
              <Button
                size="sm"
                variant="ghost"
                icon
                aria-label={`Remove a ${PIECE_NAME[piece].toLowerCase()}`}
                onClick={() => add(piece, -1)}
                disabled={disabled || army[piece] === 0}
              >
                −
              </Button>
              <span
                className="arcade__shop-count"
                data-testid={`army-count-${piece}`}
                aria-label={`${PIECE_NAME[piece]}s: ${army[piece]}`}
                role="img"
              >
                {army[piece]}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                aria-label={`Add a ${PIECE_NAME[piece].toLowerCase()}`}
                onClick={() => add(piece, 1)}
                disabled={disabled || !canAdd(army, piece, budget)}
              >
                +
              </Button>
            </span>
          </div>
        ))}
      </div>
      <div className="row arcade__presets">
        {ARMY_PRESETS.filter((p) => p.budget <= budget).map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            disabled={disabled}
            onClick={() =>
              onChange(
                preset.army,
                `${preset.name}: ${describeArmy(preset.army)}. ${describeBudget(preset.army, budget)}`,
              )
            }
          >
            {preset.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onChange(EMPTY_ARMY, `Army cleared. ${describeBudget(EMPTY_ARMY, budget)}`)
          }
        >
          Clear
        </Button>
      </div>
      {problem ? <p className="small arcade__problem">{problem}</p> : null}
    </>
  );
}
