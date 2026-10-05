import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, Kbd, LinkButton, Icon, NotFound } from '@/components/ui';
import { dueReviews } from '@/lib/puzzleReview';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';
import { themeName } from '@/features/puzzles/themes';
import { COURSE_PARAM, courseStatus, nextInCourse } from './courseProgress';
import { type Course, getCourse } from './courses';
import { getLesson, nextLesson } from './lessons';
import { renderInline } from './inline';
import { LessonText } from './LessonText';
import { type Lesson, LEVEL_LABELS } from './model';
import { firstUnfinishedStep, lessonStepKeys, taskStepKeys } from './stepKeys';
import { useLessonStep } from './useLessonStep';
import './learn.css';

export default function LessonPage() {
  const { lessonId = '' } = useParams<{ lessonId: string }>();
  const lesson = getLesson(lessonId);

  useEffect(() => {
    if (!lesson) document.title = `Lesson not found · ${siteConfig.name}`;
  }, [lesson]);

  if (!lesson) {
    return (
      <NotFound title="Lesson not found" backTo="/learn" backLabel="Back to all lessons">
        <p>There is no lesson at this address. It may have been renamed.</p>
      </NotFound>
    );
  }
  return <LessonView key={lesson.id} lesson={lesson} />;
}

/** The course a lesson was opened from (`?course=<id>`), when it really contains the lesson. */
function useCourseContext(lesson: Lesson): Course | null {
  const [searchParams] = useSearchParams();
  const course = getCourse(searchParams.get(COURSE_PARAM) ?? '');
  if (!course) return null;
  const contains = course.units.some((u) =>
    u.items.some((i) => i.type === 'lesson' && i.id === lesson.id),
  );
  return contains ? course : null;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const progress = useProgress((s) => s.lessons[lesson.id]);
  const markStep = useProgress((s) => s.markLessonStep);
  const visitLesson = useProgress((s) => s.visitLesson);
  const resetLesson = useProgress((s) => s.resetLesson);
  const autoQueen = useSettings((s) => s.autoQueen);
  const course = useCourseContext(lesson);

  const keys = useMemo(() => lessonStepKeys(lesson), [lesson]);
  const taskKeys = useMemo(() => taskStepKeys(lesson), [lesson]);
  const firstUnfinished = useMemo(
    () => firstUnfinishedStep(lesson, progress?.stepsDone),
    [lesson, progress?.stepsDone],
  );

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
  const current = Math.min(index, total - 1);
  const step = lesson.steps[current] as Lesson['steps'][number];
  const key = keys[current] as number | string;

  useEffect(() => {
    document.title = `${lesson.title} · ${siteConfig.name}`;
    visitLesson(lesson.id);
  }, [lesson.id, lesson.title, visitLesson]);

  const onSolved = useCallback(
    () => markStep(lesson.id, key, keys, taskKeys),
    [markStep, lesson.id, key, keys, taskKeys],
  );
  const state = useLessonStep(step, onSolved);

  const stepsDone = new Set(progress?.stepsDone ?? []);
  const isDone = stepsDone.has(key) || state.done;

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
    if (!step.task) markStep(lesson.id, key, keys, taskKeys);
    goTo(current + 1);
  }, [step.task, markStep, lesson.id, key, keys, taskKeys, goTo, current]);

  // Keyboard navigation (never from the board, a field or with a modifier held).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      const pressed = pageShortcutKey(e);
      if (pressed === 'ArrowRight' && (isDone || !step.task)) advance();
      else if (pressed === 'ArrowLeft') goTo(current - 1);
      else if (pressed === 'h' && step.task) state.hint();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, goTo, current, isDone, step.task, state, finished]);

  // Focus follows the lesson: the task prompt (or the step) after moving to another
  // step, the heading of the closing card at the end. Not on the first render.
  const promptRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef({ index: current, finished });
  useEffect(() => {
    if (shown.current.index === current && shown.current.finished === finished) return;
    shown.current = { index: current, finished };
    if (finished) endRef.current?.focus();
    else (promptRef.current ?? stepRef.current)?.focus();
  }, [current, finished]);

  const following = nextLesson(lesson.id);
  const orientation = step.orientation ?? 'white';

  if (finished) {
    const completed = progress?.completedAt != null;
    const open = lesson.steps.filter((_, i) => !stepsDone.has(keys[i] as number | string));
    const openTasks = open.filter((s) => s.task).length;
    const firstOpen = firstUnfinishedStep(lesson, progress?.stepsDone);
    return (
      <div>
        <LessonHeader lesson={lesson} course={course} />
        <Card className="lesson__complete">
          <div className="lesson__complete-icon" aria-hidden="true">
            <Icon name={completed ? 'award' : 'flag'} size={40} />
          </div>
          <h2 ref={endRef} tabIndex={-1} data-testid="lesson-end-title">
            {completed ? 'Lesson complete' : 'End of lesson'}
          </h2>
          <p className="muted">
            {completed
              ? lesson.practiceThemes?.length || lesson.practiceDrills?.length
                ? 'Nice work. Cement the idea with some practice.'
                : 'Nice work. Keep going with the next lesson.'
              : `You reached the end with ${
                  openTasks > 0
                    ? `${openTasks} task${openTasks === 1 ? '' : 's'} still to solve`
                    : `${open.length} step${open.length === 1 ? '' : 's'} still to read`
                }. The lesson counts as complete once every step is done.`}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {!completed ? (
              <Button variant="primary" onClick={() => goTo(firstOpen)}>
                Go to step {firstOpen + 1}
              </Button>
            ) : null}
            {lesson.practiceThemes?.map((theme) => (
              <LinkButton key={theme} to={`/puzzles/themes?theme=${encodeURIComponent(theme)}`}>
                Practise: {themeName(theme)}
              </LinkButton>
            ))}
            {lesson.practiceDrills?.map((drill) => (
              <LinkButton key={drill.to} to={drill.to}>
                Practise: {drill.title}
              </LinkButton>
            ))}
            {course ? (
              <NextInCourse course={course} lessonId={lesson.id} primary={completed} />
            ) : following ? (
              <LinkButton
                variant={completed ? 'primary' : 'secondary'}
                to={`/learn/${following.id}`}
              >
                Next lesson: {following.title}
              </LinkButton>
            ) : (
              <LinkButton variant={completed ? 'primary' : 'secondary'} to="/puzzles">
                Go solve puzzles
              </LinkButton>
            )}
          </div>
          <RecallNote scheduled={completed && taskKeys.length > 0} />
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
            {course ? (
              <LinkButton variant="ghost" size="sm" to={`/learn/course/${course.id}`}>
                Back to course
              </LinkButton>
            ) : null}
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
      <LessonHeader lesson={lesson} course={course} />

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
              Step {current + 1} of {total}
            </span>
            <ol className="lesson__steps" role="list" aria-label="Steps">
              {lesson.steps.map((s, i) => {
                const done = stepsDone.has(keys[i] as number | string);
                return (
                  <li key={String(keys[i])}>
                    <button
                      type="button"
                      className={['lesson__stepdot', done && 'lesson__stepdot--done']
                        .filter(Boolean)
                        .join(' ')}
                      aria-current={i === current ? 'step' : undefined}
                      aria-label={`Step ${i + 1}${s.title ? `: ${s.title}` : ''}${done ? ' (done)' : ''}`}
                      onClick={() => goTo(i)}
                    >
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <Card>
            <div ref={stepRef} tabIndex={-1} className="lesson__step">
              {step.title ? <h2 style={{ fontSize: '1.25rem' }}>{step.title}</h2> : null}
              <LessonText text={step.text} />
            </div>
            {step.task ? (
              <div
                ref={promptRef}
                tabIndex={-1}
                className="lesson__task"
                role="note"
                data-testid="lesson-task"
              >
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
              <Button onClick={() => goTo(current - 1)} disabled={current === 0}>
                ← Back
              </Button>
              {step.task && !isDone ? (
                <>
                  <Button onClick={state.hint} disabled={state.phase !== 'awaiting'}>
                    Hint <Kbd>H</Kbd>
                  </Button>
                  <Button variant="ghost" onClick={state.reveal} disabled={!state.canReveal}>
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
                    {current + 1 === total ? 'Finish' : 'Continue'} →
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
              Tell us<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {' · '}
            <Link to={`/analyze?fen=${encodeURIComponent(state.fen)}`}>Analyze position</Link>
            {' · '}
            <Link to={`/play?fen=${encodeURIComponent(state.fen)}`}>Play it out</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

/** "Next in course": the next unfinished item of the course the lesson was opened from. */
function NextInCourse({
  course,
  lessonId,
  primary,
}: {
  course: Course;
  lessonId: string;
  primary: boolean;
}) {
  const progress = useProgress();
  const cards = useRepertoire((s) => s.cards);
  const next = useMemo(
    () => nextInCourse(courseStatus(course, progress, cards), lessonId),
    [course, progress, cards, lessonId],
  );
  if (!next) {
    return (
      <LinkButton variant={primary ? 'primary' : 'secondary'} to={`/learn/course/${course.id}`}>
        Course complete: back to {course.title}
      </LinkButton>
    );
  }
  return (
    <LinkButton
      variant={primary ? 'primary' : 'secondary'}
      to={next.to}
      data-testid="next-in-course"
    >
      Next in course: {next.title.replace(/^Lesson: /, '')}
    </LinkButton>
  );
}

/** Where lesson recall lives, with what is due now. */
function RecallNote({ scheduled }: { scheduled: boolean }) {
  const recall = useProgress((s) => s.lessonRecall);
  const now = useNow(60_000, recall);
  const due = useMemo(() => dueReviews(recall, now).length, [recall, now]);
  return (
    <p className="small muted" style={{ margin: '16px 0 0' }}>
      {scheduled ? 'Its tasks come back for recall in a few days, then further apart. ' : ''}
      <Link to="/learn/recall" data-testid="lesson-recall-link">
        {due > 0 ? `Recall ${due} position${due === 1 ? '' : 's'} due now` : 'Lesson recall'}
      </Link>
    </p>
  );
}

function LessonHeader({ lesson, course }: { lesson: Lesson; course: Course | null }) {
  return (
    <div className="page-header">
      <div className="row" style={{ marginBottom: 6 }}>
        {course ? (
          <Link to={`/learn/course/${course.id}`} className="small" data-testid="back-to-course">
            ← Back to course: {course.title}
          </Link>
        ) : (
          <Link to="/learn" className="small">
            ← All lessons
          </Link>
        )}
        <Badge>{LEVEL_LABELS[lesson.level].title}</Badge>
        <Badge>{lesson.category}</Badge>
        <span className="small muted">{lesson.minutes} min</span>
      </div>
      <h1>{lesson.title}</h1>
      <p>{lesson.summary}</p>
    </div>
  );
}
