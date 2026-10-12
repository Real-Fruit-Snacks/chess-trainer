import { useEffect } from 'react';
import { Link } from 'react-router';
import { Badge, Icon, LinkButton } from '@/components/ui';
import { ListNoMatch, ListSearch } from '@/components/list/ListSearch';
import { matchesAllWords } from '@/lib/textMatch';
import { useListParams } from '@/lib/useListParams';
import { siteConfig } from '@/site.config';
import { type DrillResult, useProgress } from '@/store/progress';
import { Difficulty } from './Difficulty';
import { DRILL_GROUPS } from './endgameDrills';
import { buildEndgameLadder, describeLadder } from './endgameLadder';
import './drills.css';

interface DrillCard {
  id: string;
  to: string;
  title: string;
  description: string;
  meta: string;
  difficulty: number;
}

const SKILL_DRILLS: DrillCard[] = [
  {
    id: 'coordinates',
    to: '/drills/coordinates',
    title: 'Coordinates',
    description:
      'A square name flashes up — click it. Thirty seconds, from either side of the board.',
    meta: 'Board vision · 30 s',
    difficulty: 1,
  },
  {
    id: 'vision-moves',
    to: '/drills/vision?mode=moves',
    title: 'Piece movement',
    description:
      'Click every square a piece can move to, blockers and all. Builds instant pattern recognition.',
    meta: 'Board vision · 60 s',
    difficulty: 1,
  },
  {
    id: 'vision-captures',
    to: '/drills/vision?mode=captures',
    title: 'Find every capture',
    description:
      'Real positions: play every legal capture for the side to move before the clock runs out.',
    meta: 'Calculation · 60 s',
    difficulty: 2,
  },
  {
    id: 'vision-checks',
    to: '/drills/vision?mode=checks',
    title: 'Find every check',
    description:
      'Checks are forcing moves — spotting them all, fast, is the first step of every calculation.',
    meta: 'Calculation · 60 s',
    difficulty: 2,
  },
  {
    id: 'vision-recall',
    to: '/drills/vision?mode=recall',
    title: 'Guess the position',
    description:
      'The opening of a famous game as text, an empty board: click where each piece stands now.',
    meta: 'Visualisation · 90 s',
    difficulty: 2,
  },
  {
    id: 'blind-puzzles',
    to: '/puzzles/blind',
    title: 'Blind puzzles',
    description:
      'Puzzles with the board frozen at the start: the whole line has to be seen in your head.',
    meta: 'Visualisation · 2 to 4+ moves',
    difficulty: 3,
  },
  {
    id: 'threats',
    to: '/drills/threats',
    title: 'What’s the threat?',
    description:
      'Name what your opponent threatens, then meet it — in real positions, and in your own games once reviewed.',
    meta: 'Calculation · defence',
    difficulty: 2,
  },
  {
    id: 'mating-patterns',
    to: '/patterns?drill=all',
    title: 'Mating patterns',
    description:
      'The nineteen named mates, one after another: the defender moves, you find the mate.',
    meta: 'Pattern recognition · 19 positions',
    difficulty: 2,
  },
];

function bestLabel(result: DrillResult | undefined, kind: 'score' | 'endgame'): string | null {
  if (!result) return null;
  if (kind === 'endgame') return result.detail ?? (result.best > 0 ? 'Completed' : 'Attempted');
  return `Best ${result.best}`;
}

export default function DrillsPage() {
  const drills = useProgress((s) => s.drills);

  useEffect(() => {
    document.title = `Drills · ${siteConfig.name}`;
  }, []);

  const groups = DRILL_GROUPS;
  const ladder = buildEndgameLadder(drills);
  // The search and the group are kept in the address, so Back from a drill returns to them.
  const list = useListParams();
  const query = list.get('q');
  const groupFilter = DRILL_GROUPS.find((g) => g === list.get('group')) ?? '';
  const rungsShown = ladder.rungs.filter(
    ({ drill }) =>
      (!groupFilter || drill.group === groupFilter) &&
      matchesAllWords(query, drill.title, drill.description, drill.group),
  );

  return (
    <div>
      <div className="page-header">
        <h1>Drills</h1>
        <p>
          Short, repeatable exercises for the skills that games are made of: seeing the board fast,
          calculating forcing moves, and converting won endgames against a full-strength engine.
        </p>
      </div>

      <section className="drills__section">
        <h2>Board vision and calculation</h2>
        <div className="grid grid--cards">
          {SKILL_DRILLS.map((card) => {
            const best =
              card.id === 'mating-patterns'
                ? drills[card.id]?.detail
                  ? `Best ${drills[card.id]?.detail}`
                  : null
                : bestLabel(drills[card.id], 'score');
            return (
              <Link key={card.id} to={card.to} className="card card--interactive drill-card">
                <span className="card__title">{card.title}</span>
                <p className="small muted" style={{ margin: 0 }}>
                  {card.description}
                </p>
                {/* The badge sits at the foot, so the title has the card's whole width. */}
                <div className="card__foot">
                  <span className="drill-card__meta">{card.meta}</span>
                  {best ? (
                    <Badge tone="success">{best}</Badge>
                  ) : (
                    <Difficulty level={card.difficulty} />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="drills__section" data-testid="endgame-ladder">
        <h2>Endgame library</h2>
        <div className="card ladder">
          <div className="row row--between">
            <div>
              <p className="card__eyebrow">Endgame ladder</p>
              <strong data-testid="ladder-progress">{describeLadder(ladder)}</strong>
            </div>
            {ladder.next ? (
              <LinkButton
                variant="primary"
                to={`/drills/endgame/${ladder.next.drill.id}`}
                data-testid="ladder-next"
              >
                Rung {ladder.next.rung}: {ladder.next.drill.title}
              </LinkButton>
            ) : (
              <Badge tone="success">Complete</Badge>
            )}
          </div>
          <div
            className="ladder__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ladder.total}
            aria-valuenow={ladder.done}
            aria-label="Endgame ladder progress"
          >
            <span style={{ width: `${(ladder.done / ladder.total) * 100}%` }} />
          </div>
          <ul className="ladder__groups" role="list" aria-label="Groups">
            {ladder.groups.map((g) => (
              <li key={g.group}>
                <Badge tone={g.done === g.total ? 'success' : 'neutral'}>
                  {g.group} {g.done}/{g.total}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="small muted ladder__about">
            Every drill is a rung, from the elementary mates up to Réti and Vancura; a rung is
            climbed the first time you complete it. Each position was checked with the engine, and
            you play it out against Stockfish at full strength.
          </p>
        </div>
      </section>

      <ListSearch
        value={query}
        onChange={(q) => list.set('q', q)}
        label="Find an endgame"
        shown={rungsShown.length}
        total={ladder.rungs.length}
        noun={['endgame', 'endgames']}
      >
        <label className="sr-only" htmlFor="drill-group">
          Group
        </label>
        <select
          id="drill-group"
          className="select list-search__select"
          value={groupFilter}
          onChange={(e) => list.set('group', e.target.value)}
        >
          <option value="">Every group</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </ListSearch>
      {rungsShown.length === 0 ? (
        <ListNoMatch onClear={() => list.clear('q', 'group')}>
          No endgame {groupFilter ? `in ${groupFilter} ` : ''}matches “{query}”.
        </ListNoMatch>
      ) : null}

      {groups.map((group) => {
        const rows = rungsShown.filter((r) => r.drill.group === group);
        if (rows.length === 0) return null;
        const counts = ladder.groups.find((g) => g.group === group);
        return (
          <section key={group} className="drills__section">
            <h2>
              {group}{' '}
              <span className="small muted drills__count">
                {counts?.done ?? 0}/{counts?.total ?? 0}
              </span>
            </h2>
            {/* An index of rows, not cards: forty endgames read best as a list. */}
            <ol className="endgame-index" role="list">
              {rows.map(({ drill, rung, done }) => {
                const result = drills[drill.id];
                const best = bestLabel(result, 'endgame');
                return (
                  <li key={drill.id}>
                    <Link
                      to={`/drills/endgame/${drill.id}`}
                      className={`endgame-row${done ? ' endgame-row--done' : ''}`}
                    >
                      <span
                        className={`endgame-row__mark${done ? ' is-done' : ''}`}
                        aria-hidden="true"
                      >
                        <Icon name="check" size={14} />
                      </span>
                      <span className="endgame-row__text">
                        <span className="endgame-row__title">{drill.title}</span>
                        <span className="endgame-row__about small muted">{drill.description}</span>
                        <span className="drill-card__meta">
                          Rung {rung} · You play {drill.color}
                          {result?.attempts
                            ? ` · ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}`
                            : ''}
                          {done ? ' · climbed' : ''}
                        </span>
                      </span>
                      <span className="endgame-row__end">
                        {best && result?.best ? (
                          <Badge tone="success">{best}</Badge>
                        ) : (
                          <Difficulty level={drill.difficulty} max={4} />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
