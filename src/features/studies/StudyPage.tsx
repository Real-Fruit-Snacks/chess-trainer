import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, Kbd, LinkButton } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { getStudy, STUDIES, type Study } from './studies';
import { useStudy } from './useStudy';
import './studies.css';

export default function StudyPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const study = getStudy(studyId);
  if (!study) {
    return (
      <Card className="onboarding">
        <h2>Study not found</h2>
        <LinkButton to="/studies">All studies</LinkButton>
      </Card>
    );
  }
  return <StudyView key={study.id} study={study} />;
}

function StudyView({ study }: { study: Study }) {
  const recordStudy = useProgress((s) => s.recordStudy);
  const result = useProgress((s) => s.studies[study.id]);
  const autoQueen = useSettings((s) => s.autoQueen);
  const onDone = useCallback(
    (outcome: 'solved' | 'revealed', assisted: boolean) => {
      recordStudy(study.id, outcome === 'solved' ? 'solved' : 'failed', !assisted);
    },
    [recordStudy, study.id],
  );
  const state = useStudy(study, onDone);
  const index = STUDIES.findIndex((s) => s.id === study.id);
  const following = STUDIES[index + 1];

  useEffect(() => {
    document.title = `${study.title} · ${siteConfig.name}`;
  }, [study.title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'h') state.hint();
      if (e.key === 's') state.reveal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const finished = state.phase === 'solved' || state.phase === 'revealed';
  const goalText = `${state.solver === 'white' ? 'White' : 'Black'} to play and ${study.goal}`;

  return (
    <div>
      <p className="small">
        <Link to="/studies">Endgame studies</Link> / {study.composer}
        {study.year ? ` ${study.year}` : ''}
      </p>
      <div className="page-header">
        <h1>{study.title}</h1>
        <p>{study.intro}</p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          <Board
            fen={state.fen}
            orientation={state.solver}
            turnColor={state.turn}
            movableColor={state.phase === 'solving' ? state.solver : undefined}
            dests={state.dests}
            lastMove={state.lastMove}
            check={state.check}
            shapes={state.shapes}
            highlights={state.highlights}
            drawable={false}
            onMove={(from, to) => state.playMove(from, to, autoQueen ? 'q' : undefined)}
            ariaLabel={`Study: ${study.title}, ${goalText}`}
          />
          {state.needsPromotion ? (
            <PromotionPicker color={state.turn} onSelect={state.resolvePromotion} />
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong data-testid="study-goal">{goalText}</strong>
              <Badge tone="accent">
                Move {Math.min(state.ply + 1, state.total)} of {state.total}
              </Badge>
            </div>
            <p
              className={`lesson__feedback ${state.phase === 'wrong' ? 'puzzle-status--failed' : finished ? 'puzzle-status--solved' : 'muted'}`}
              role="status"
              style={{ marginTop: 12 }}
              data-testid="study-status"
            >
              {state.phase === 'solved'
                ? state.assisted
                  ? 'Solved with help.'
                  : 'Solved! Every move was the study’s.'
                : state.phase === 'revealed'
                  ? 'The solution has been played through.'
                  : (state.feedback ?? 'Find the move on the board.')}
            </p>
            {state.played.length > 0 ? (
              <p className="small mono study__moves" aria-label="Moves played">
                {state.played.join(' ')}
              </p>
            ) : null}
            <div className="lesson__actions">
              {!finished ? (
                <>
                  <Button onClick={state.hint} disabled={state.phase !== 'solving'}>
                    Hint <Kbd>H</Kbd>
                  </Button>
                  <Button variant="ghost" onClick={state.reveal}>
                    Show solution <Kbd>S</Kbd>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={state.retry}>
                    Replay
                  </Button>
                  <LinkButton
                    to={`/play?fen=${encodeURIComponent(state.fen)}&color=${state.solver}`}
                    title="Continue from the final position against the engine"
                  >
                    Play it out
                  </LinkButton>
                  {following ? (
                    <LinkButton variant="primary" to={`/studies/${following.id}`}>
                      Next study →
                    </LinkButton>
                  ) : (
                    <LinkButton variant="primary" to="/studies">
                      All studies
                    </LinkButton>
                  )}
                </>
              )}
            </div>
          </Card>

          {finished ? (
            <Card>
              <p className="card__eyebrow">Why it works</p>
              <p style={{ margin: 0 }}>{study.outro}</p>
              {study.source ? (
                <p className="small faint" style={{ margin: '8px 0 0' }}>
                  First published: {study.source}.
                </p>
              ) : null}
            </Card>
          ) : (
            <Card>
              <p className="card__eyebrow">Themes</p>
              <div className="row" style={{ gap: 4 }}>
                {study.themes.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
              </div>
              {result?.solvedAt ? (
                <p className="small muted" style={{ margin: '8px 0 0' }}>
                  You solved this one before{result.clean ? ' without help' : ''}.
                </p>
              ) : null}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
