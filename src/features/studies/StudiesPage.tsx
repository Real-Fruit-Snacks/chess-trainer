import { useEffect } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui';
import { Difficulty } from '@/features/drills/Difficulty';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { STUDIES } from './studies';
import './studies.css';

export default function StudiesPage() {
  const results = useProgress((s) => s.studies);
  const solved = STUDIES.filter((s) => results[s.id]?.solvedAt).length;

  useEffect(() => {
    document.title = `Endgame studies · ${siteConfig.name}`;
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Endgame studies</h1>
        <p>
          Composed positions with a single beautiful solution — classics by Réti and Saavedra next
          to the only-move endings every player should know. Find the moves, then play the position
          out against the engine.
        </p>
      </div>
      <p className="small muted" data-testid="studies-progress">
        {solved} of {STUDIES.length} solved
      </p>
      <div className="grid grid--cards">
        {STUDIES.map((study) => {
          const result = results[study.id];
          return (
            <Link
              key={study.id}
              to={`/studies/${study.id}`}
              className={`card card--interactive study-card${result?.solvedAt ? ' study-card--done' : ''}`}
              data-testid={`study-${study.id}`}
            >
              <div className="row row--between">
                <span className="card__title">{study.title}</span>
                <span className="row" style={{ gap: 4 }}>
                  {result?.solvedAt ? (
                    <Badge tone="success">{result.clean ? 'Solved' : 'Solved with help'}</Badge>
                  ) : (
                    <Difficulty level={study.difficulty} />
                  )}
                  <Badge tone={study.goal === 'win' ? 'accent' : 'info'}>
                    {study.goal === 'win' ? 'Win' : 'Draw'}
                  </Badge>
                </span>
              </div>
              <span className="small muted">
                {study.composer}
                {study.year ? `, ${study.year}` : ''} · {study.line.length} move
                {study.line.length === 1 ? '' : 's'} to find
              </span>
              <span className="row" style={{ gap: 4 }}>
                {study.themes.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
