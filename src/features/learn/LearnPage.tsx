import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Badge, LinkButton, ProgressBar } from '@/components/ui';
import { dueReviews } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { type LessonProgress, useProgress } from '@/store/progress';
import { CoursesSection } from './CoursesSection';
import { lessons, lessonsByLevel } from './lessons';
import { LEVEL_LABELS, type Lesson, type LessonLevel } from './model';
import { countStepsDone } from './stepKeys';
import './learn.css';

const LEVELS: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

export default function LearnPage() {
  const progress = useProgress((s) => s.lessons);

  useEffect(() => {
    document.title = `Learn · ${siteConfig.name}`;
  }, []);

  const completed = lessons.filter((l) => progress[l.id]?.completedAt).length;
  const continueLesson = pickContinueLesson(lessons, progress);

  return (
    <div>
      <div className="page-header row row--between">
        <div>
          <h1>Learn</h1>
          <p>
            Short interactive lessons — read a little, then play the idea on the board. Every
            position is engine-checked.
          </p>
        </div>
        <LinkButton to="/placement" size="sm">
          Not sure where to start? Placement quiz
        </LinkButton>
      </div>

      <div className="learn__summary card">
        <div className="row row--between">
          <div>
            <strong>
              {completed} of {lessons.length} lessons completed
            </strong>
            <div className="small muted">
              {continueLesson
                ? `Up next: ${continueLesson.title}`
                : 'You have finished the whole curriculum!'}
            </div>
          </div>
          {continueLesson ? (
            <LinkButton variant="primary" to={`/learn/${continueLesson.id}`}>
              {countStepsDone(continueLesson, progress[continueLesson.id]?.stepsDone)
                ? 'Continue'
                : 'Start'}{' '}
              lesson
            </LinkButton>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={completed} max={lessons.length} label="Curriculum progress" />
        </div>
      </div>

      <RecallCard />

      <CoursesSection />

      {LEVELS.map((level) => {
        const meta = LEVEL_LABELS[level];
        const list = lessonsByLevel[level];
        return (
          <section key={level} className="learn__level" aria-labelledby={`level-${level}`}>
            <div className="learn__level-header">
              <h2 id={`level-${level}`}>{meta.title}</h2>
              <Badge>{meta.ratingHint}</Badge>
            </div>
            <p className="muted">{meta.blurb}</p>
            <ol className="learn__grid" role="list">
              {list.map((lesson, index) => {
                const state = progress[lesson.id];
                const done = countStepsDone(lesson, state?.stepsDone);
                const total = lesson.steps.length;
                const status = state?.completedAt ? 'done' : done > 0 ? 'started' : 'new';
                return (
                  <li key={lesson.id}>
                    <Link
                      to={`/learn/${lesson.id}`}
                      className={`lesson-card lesson-card--${status}`}
                    >
                      <div className="lesson-card__top">
                        <span className="lesson-card__index">{index + 1}</span>
                        <span className="lesson-card__category">{lesson.category}</span>
                        <span className="lesson-card__time">{lesson.minutes} min</span>
                      </div>
                      <h3 className="lesson-card__title">{lesson.title}</h3>
                      <p className="lesson-card__summary">{lesson.summary}</p>
                      <div className="lesson-card__footer">
                        {status === 'done' ? (
                          <Badge tone="success">Completed</Badge>
                        ) : status === 'started' ? (
                          <Badge tone="accent">
                            {done}/{total} steps
                          </Badge>
                        ) : (
                          <Badge>{total} steps</Badge>
                        )}
                        {lesson.steps.some((s) => s.task) ? (
                          <span className="small faint">Interactive</span>
                        ) : null}
                      </div>
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

function pickContinueLesson(
  all: Lesson[],
  progress: Record<string, LessonProgress>,
): Lesson | null {
  const started = all.find(
    (l) => !progress[l.id]?.completedAt && countStepsDone(l, progress[l.id]?.stepsDone) > 0,
  );
  if (started) return started;
  return all.find((l) => !progress[l.id]?.completedAt) ?? null;
}

/**
 * Lesson recall, one click from Learn: what is due now and what is scheduled.
 * Nothing to show until a finished lesson has scheduled its task positions.
 */
function RecallCard() {
  const recall = useProgress((s) => s.lessonRecall);
  const now = useNow(60_000, recall);
  const due = useMemo(() => dueReviews(recall, now).length, [recall, now]);
  const scheduled = Object.keys(recall).length;
  if (scheduled === 0) return null;
  return (
    <section
      className="learn__recall card"
      aria-labelledby="recall-title"
      data-testid="learn-recall"
    >
      <div className="row row--between">
        <div>
          <h2 id="recall-title" className="card__title" style={{ margin: 0 }}>
            Lesson recall
          </h2>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {due > 0
              ? `${due} position${due === 1 ? '' : 's'} due now`
              : `Nothing due right now · ${scheduled} position${scheduled === 1 ? '' : 's'} scheduled`}
          </p>
        </div>
        <LinkButton variant={due > 0 ? 'primary' : 'secondary'} to="/learn/recall">
          {due > 0 ? 'Recall now' : 'Open recall'}
        </LinkButton>
      </div>
    </section>
  );
}
