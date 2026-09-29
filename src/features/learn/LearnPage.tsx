import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ProgressBar } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { lessons, lessonsByLevel } from './lessons';
import { LEVEL_LABELS, type Lesson, type LessonLevel } from './model';
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
      <div className="page-header">
        <h1>Learn</h1>
        <p>
          Short interactive lessons — read a little, then play the idea on the board. Every position
          is engine-checked.
        </p>
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
            <Link className="btn btn--primary" to={`/learn/${continueLesson.id}`}>
              {progress[continueLesson.id]?.stepsDone.length ? 'Continue' : 'Start'} lesson
            </Link>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={completed} max={lessons.length} label="Curriculum progress" />
        </div>
      </div>

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
            <ol className="learn__grid">
              {list.map((lesson, index) => {
                const state = progress[lesson.id];
                const done = state?.stepsDone.length ?? 0;
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
  progress: Record<string, { stepsDone: number[]; completedAt: number | null }>,
): Lesson | null {
  const started = all.find(
    (l) =>
      progress[l.id] && !progress[l.id]?.completedAt && (progress[l.id]?.stepsDone.length ?? 0) > 0,
  );
  if (started) return started;
  return all.find((l) => !progress[l.id]?.completedAt) ?? null;
}
