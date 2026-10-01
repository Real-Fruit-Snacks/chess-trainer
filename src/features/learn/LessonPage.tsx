import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, Kbd, LinkButton, Icon } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { themeName } from '@/features/puzzles/themes';
import { getLesson, nextLesson } from './lessons';
import { renderInline } from './inline';
import { LessonText } from './LessonText';
import { LEVEL_LABELS } from './model';
import { useLessonStep } from './useLessonStep';
import './learn.css';

export default function LessonPage() {
  const { lessonId = '' } = useParams<{ lessonId: string }>();
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return (
      <div className="page-header">
        <h1>Lesson not found</h1>
        <p>
          <Link to="/learn">Back to all lessons</Link>
        </p>
      </div>
    );
  }
  return <LessonView key={lesson.id} lesson={lesson} />;
}

function LessonView({ lesson }: { lesson: NonNullable<ReturnType<typeof getLesson>> }) {
  const progress = useProgress((s) => s.lessons[lesson.id]);
  const markStep = useProgress((s) => s.markLessonStep);
  const visitLesson = useProgress((s) => s.visitLesson);
  const resetLesson = useProgress((s) => s.resetLesson);
  const autoQueen = useSettings((s) => s.autoQueen);

  const firstUnfinished = useMemo(() => {
    const done = new Set(progress?.stepsDone ?? []);
    const idx = lesson.steps.findIndex((_, i) => !done.has(i));
    return idx === -1 ? 0 : idx;
  }, [lesson.steps, progress?.stepsDone]);

  // `?step=3` opens a specific step (1-based), e.g. from the recall page.
  const [searchParams] = useSearchParams();
  const requestedStep = Number(searchParams.get('step'));
  const [index, setIndex] = useState(
    requestedStep >= 1 && requestedStep <= lesson.steps.length
      ? requestedStep - 1
      : firstUnfinished,
  );
  const [finished, setFinished] = useState(false);
  const total = lesson.steps.length;
  const taskSteps = useMemo(
    () => lesson.steps.flatMap((s, i) => (s.task ? [i] : [])),
    [lesson.steps],
  );
  const step = lesson.steps[Math.min(index, total - 1)] as (typeof lesson.steps)[number];

  useEffect(() => {
    document.title = `${lesson.title} · ${siteConfig.name}`;
    visitLesson(lesson.id);
  }, [lesson.id, lesson.title, visitLesson]);

  const onSolved = useCallback(
    () => markStep(lesson.id, index, total, taskSteps),
    [markStep, lesson.id, index, total, taskSteps],
  );
  const state = useLessonStep(step, onSolved);

  const stepsDone = new Set(progress?.stepsDone ?? []);
  const isDone = stepsDone.has(index) || state.done;

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= total) {
        setFinished(true);
        return;
      }
      setFinished(false);
      setIndex(next);
    },
    [total],
  );

  const advance = useCallback(() => {
    if (!step.task) markStep(lesson.id, index, total, taskSteps);
    goTo(index + 1);
  }, [step.task, markStep, lesson.id, index, total, taskSteps, goTo]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight' && (isDone || !step.task)) advance();
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'h' && step.task) state.hint();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, goTo, index, isDone, step.task, state]);

  const following = nextLesson(lesson.id);
  const orientation = step.orientation ?? 'white';

  if (finished) {
    const completedAt = progress?.completedAt;
    return (
      <div>
        <LessonHeader lesson={lesson} />
        <Card className="lesson__complete">
          <div className="lesson__complete-icon" aria-hidden="true">
            <Icon name="award" size={40} />
          </div>
          <h2>Lesson complete</h2>
          <p className="muted">
            {completedAt ? 'Nice work. ' : 'You reached the end. '}
            {lesson.practiceThemes?.length
              ? 'Cement the idea with a few puzzles on the same theme.'
              : 'Keep going with the next lesson.'}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {lesson.practiceThemes?.map((theme) => (
              <LinkButton key={theme} to={`/puzzles/themes?theme=${encodeURIComponent(theme)}`}>
                Practise: {themeName(theme)}
              </LinkButton>
            ))}
            {following ? (
              <LinkButton variant="primary" to={`/learn/${following.id}`}>
                Next lesson: {following.title}
              </LinkButton>
            ) : (
              <LinkButton variant="primary" to="/puzzles">
                Go solve puzzles
              </LinkButton>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetLesson(lesson.id);
                setFinished(false);
                setIndex(0);
              }}
            >
              Restart lesson
            </Button>
            <LinkButton variant="ghost" size="sm" to="/learn">
              All lessons
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <LessonHeader lesson={lesson} />

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          <Board
            fen={state.fen}
            orientation={orientation}
            turnColor={state.turn}
            movableColor={step.task && state.phase === 'awaiting' ? state.turn : undefined}
            dests={state.dests}
            lastMove={state.lastMove}
            check={state.check}
            shapes={state.shapes}
            highlights={state.highlights}
            viewOnly={!step.task}
            drawable={false}
            onMove={(from, to) => state.playMove(from, to, autoQueen ? 'q' : undefined)}
            ariaLabel={`Lesson diagram: ${step.title ?? lesson.title}`}
          />
          {state.needsPromotion ? (
            <PromotionPicker color={state.turn} onSelect={state.resolvePromotion} />
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <div className="lesson__nav">
            <span className="small muted">
              Step {index + 1} of {total}
            </span>
            <div className="lesson__steps" role="list" aria-label="Steps">
              {lesson.steps.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  role="listitem"
                  className={['lesson__stepdot', stepsDone.has(i) && 'lesson__stepdot--done']
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Step ${i + 1}${s.title ? `: ${s.title}` : ''}${stepsDone.has(i) ? ' (done)' : ''}`}
                  onClick={() => goTo(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <Card>
            {step.title ? <h2 style={{ fontSize: '1.25rem' }}>{step.title}</h2> : null}
            <LessonText text={step.text} />
            {step.task ? (
              <div className="lesson__task" role="note">
                <span className={`turn-dot turn-dot--${state.turn}`} aria-hidden="true" />
                {state.turn === 'white' ? 'White' : 'Black'} to move —{' '}
                {renderInline(step.task.prompt)}
              </div>
            ) : null}
            <p
              className={`lesson__feedback ${state.phase === 'wrong' ? 'puzzle-status--failed' : state.phase === 'correct' ? 'puzzle-status--solved' : 'muted'}`}
              role="status"
              style={{ marginTop: 12 }}
            >
              {state.feedback
                ? renderInline(state.feedback)
                : step.task && state.phase === 'awaiting'
                  ? 'Make your move on the board.'
                  : ''}
            </p>

            <div className="lesson__actions">
              <Button onClick={() => goTo(index - 1)} disabled={index === 0}>
                ← Back
              </Button>
              {step.task && !isDone ? (
                <>
                  <Button onClick={state.hint} disabled={state.phase !== 'awaiting'}>
                    Hint <Kbd>H</Kbd>
                  </Button>
                  <Button variant="ghost" onClick={state.reveal}>
                    Show answer
                  </Button>
                  <Button variant="ghost" onClick={advance}>
                    Skip
                  </Button>
                </>
              ) : (
                <>
                  {step.task && state.phase !== 'awaiting' ? (
                    <Button variant="ghost" onClick={state.retry}>
                      Replay
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={advance} autoFocus={isDone && !!step.task}>
                    {index + 1 === total ? 'Finish' : 'Continue'} →
                  </Button>
                </>
              )}
            </div>
          </Card>

          <p className="small faint">
            <Kbd>←</Kbd> <Kbd>→</Kbd> to move between steps · Problems with this lesson?{' '}
            <a
              href={`${siteConfig.repositoryUrl}/issues/new?template=lesson_proposal.yml&title=${encodeURIComponent(`Lesson feedback: ${lesson.title}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Tell us
            </a>
            {' · '}
            <Link to={`/analyze?fen=${encodeURIComponent(state.fen)}`}>Analyze this position</Link>
            {' · '}
            <Link to={`/play?fen=${encodeURIComponent(state.fen)}`}>Play it vs the engine</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function LessonHeader({ lesson }: { lesson: NonNullable<ReturnType<typeof getLesson>> }) {
  return (
    <div className="page-header">
      <div className="row" style={{ marginBottom: 6 }}>
        <Link to="/learn" className="small">
          ← All lessons
        </Link>
        <Badge>{LEVEL_LABELS[lesson.level].title}</Badge>
        <Badge>{lesson.category}</Badge>
        <span className="small muted">{lesson.minutes} min</span>
      </div>
      <h1>{lesson.title}</h1>
      <p>{lesson.summary}</p>
    </div>
  );
}
