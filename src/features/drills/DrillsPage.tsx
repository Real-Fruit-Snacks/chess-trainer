import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { type DrillResult, useProgress } from '@/store/progress';
import { DRILL_GROUPS, ENDGAME_DRILLS } from './endgameDrills';
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
            const best = bestLabel(drills[card.id], 'score');
            return (
              <Link key={card.id} to={card.to} className="card card--interactive drill-card">
                <div className="row row--between">
                  <span className="card__title">{card.title}</span>
                  {best ? (
                    <Badge tone="success">{best}</Badge>
                  ) : (
                    <Badge>{'★'.repeat(card.difficulty)}</Badge>
                  )}
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {card.description}
                </p>
                <span className="drill-card__meta">{card.meta}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {groups.map((group) => (
        <section key={group} className="drills__section">
          <h2>{group}</h2>
          <div className="grid grid--cards">
            {ENDGAME_DRILLS.filter((d) => d.group === group).map((drill) => {
              const result = drills[drill.id];
              const best = bestLabel(result, 'endgame');
              return (
                <Link
                  key={drill.id}
                  to={`/drills/endgame/${drill.id}`}
                  className="card card--interactive drill-card"
                >
                  <div className="row row--between">
                    <span className="card__title">{drill.title}</span>
                    {best && result?.best ? (
                      <Badge tone="success">{best}</Badge>
                    ) : (
                      <Badge>{'★'.repeat(drill.difficulty)}</Badge>
                    )}
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>
                    {drill.description}
                  </p>
                  <span className="drill-card__meta">
                    You play {drill.color} · vs full-strength engine
                    {result?.attempts
                      ? ` · ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
