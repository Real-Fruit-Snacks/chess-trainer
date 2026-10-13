import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, LinkButton, ProgressBar, Segmented, Switch } from '@/components/ui';
import { ListNoMatch, ListSearch } from '@/components/list/ListSearch';
import { matchesAllWords } from '@/lib/textMatch';
import { dueReviews } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { type LessonProgress, useProgress } from '@/store/progress';
import { CoursesSection } from './CoursesSection';
import { LESSON_META } from './lessonMeta';
import type { LessonMeta } from './lessonMetaFormat';
import { LEVEL_LABELS, type LessonLevel } from './model';
import { LessonCheck } from './LessonDone';
import { countKeysDone } from './stepKeys';
import './learn.css';

const LEVELS: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

type LevelFilter = LessonLevel | 'all';
const isLevel = (value: string | null): value is LessonLevel =>
  LEVELS.includes(value as LessonLevel);

export default function LearnPage() {
  const progress = useProgress((s) => s.lessons);
  // The search, the level and "hide finished" live in the address, so Back returns to them.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const levelParam = params.get('level');
  const level: LevelFilter = isLevel(levelParam) ? levelParam : 'all';
  const hideDone = params.get('hide') === 'done';
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  const shown = LESSON_META.filter(
    (l) =>
      (level === 'all' || l.level === level) &&
      !(hideDone && progress[l.id]?.completedAt) &&
      matchesAllWords(query, l.title, l.summary, l.category),
  );
  const filtered = shown.length !== LESSON_META.length;

  useEffect(() => {
    document.title = `Learn · ${siteConfig.name}`;
  }, []);

  const completed = LESSON_META.filter((l) => progress[l.id]?.completedAt).length;
  const continueLesson = pickContinueLesson(LESSON_META, progress);

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
              {completed} of {LESSON_META.length} lessons completed
            </strong>
            <div className="small muted">
              {continueLesson
                ? `Up next: ${continueLesson.title}`
                : 'You have finished the whole curriculum!'}
            </div>
          </div>
          {continueLesson ? (
            <LinkButton variant="primary" to={`/learn/${continueLesson.id}`}>
              {countKeysDone(continueLesson.stepKeys, progress[continueLesson.id]?.stepsDone)
                ? 'Continue'
                : 'Start'}{' '}
              lesson
            </LinkButton>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={completed} max={LESSON_META.length} label="Curriculum progress" />
        </div>
      </div>

      <RecallCard />

      <CoursesSection />

      <section className="learn__lessons" aria-labelledby="lessons-title">
        <h2 id="lessons-title" className="learn__lessons-title">
          All lessons
        </h2>
        <ListSearch
          value={query}
          onChange={(q) => setParam('q', q || null)}
          label="Find a lesson"
          shown={shown.length}
          total={LESSON_META.length}
          noun={['lesson', 'lessons']}
          testId="lesson-search"
        >
          <Segmented<LevelFilter>
            ariaLabel="Level"
            value={level}
            onChange={(next) => setParam('level', next === 'all' ? null : next)}
            options={[
              { value: 'all', label: 'All' },
              ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l].title })),
            ]}
          />
          <Switch
            checked={hideDone}
            onChange={(next) => setParam('hide', next ? 'done' : null)}
            label="Hide finished"
          />
        </ListSearch>

        {shown.length === 0 ? (
          <ListNoMatch onClear={() => setParams({}, { replace: true, preventScrollReset: true })}>
            No lesson matches{query ? ` “${query}”` : ''}
            {level !== 'all' ? ` in ${LEVEL_LABELS[level].title}` : ''}
            {hideDone ? ' among the ones you have not finished' : ''}.
          </ListNoMatch>
        ) : null}

        {LEVELS.map((lessonLevel) => {
          const meta = LEVEL_LABELS[lessonLevel];
          const all = LESSON_META.filter((l) => l.level === lessonLevel);
          const list = shown.filter((l) => l.level === lessonLevel);
          if (list.length === 0) return null;
          return (
            <section
              key={lessonLevel}
              className="learn__level"
              aria-labelledby={`level-${lessonLevel}`}
            >
              <div className="learn__level-header">
                <h3 id={`level-${lessonLevel}`}>{meta.title}</h3>
                <Badge>{meta.ratingHint}</Badge>
                <span className="small muted learn__level-count">
                  {filtered ? `${list.length} of ${all.length}` : `${all.length} lessons`}
                </span>
              </div>
              {filtered ? null : <p className="muted learn__level-blurb">{meta.blurb}</p>}
              <ol className="learn__grid" role="list">
                {list.map((lesson) => {
                  const index = all.indexOf(lesson);
                  const state = progress[lesson.id];
                  const done = countKeysDone(lesson.stepKeys, state?.stepsDone);
                  const total = lesson.steps;
                  const status = state?.completedAt ? 'done' : done > 0 ? 'started' : 'new';
                  return (
                    <li key={lesson.id} className="lesson-card__item">
                      <Link
                        to={`/learn/${lesson.id}`}
                        className={`lesson-card lesson-card--${status}`}
                      >
                        <div className="lesson-card__top">
                          <span className="lesson-card__index">{index + 1}</span>
                          <span className="lesson-card__category">{lesson.category}</span>
                          <span className="lesson-card__time">{lesson.minutes} min</span>
                        </div>
                        <h4 className="lesson-card__title">{lesson.title}</h4>
                        <p className="lesson-card__summary">{lesson.summary}</p>
                        <div className="lesson-card__footer">
                          {status === 'done' ? (
                            <Badge tone="success">
                              {state?.marked ? 'Marked done' : 'Completed'}
                            </Badge>
                          ) : status === 'started' ? (
                            <Badge tone="accent">
                              {done}/{total} steps
                            </Badge>
                          ) : (
                            <Badge>{total} steps</Badge>
                          )}
                        </div>
                      </Link>
                      {/* Beside the link, not inside it: a button cannot sit in a link. */}
                      <LessonCheck
                        lessonId={lesson.id}
                        title={lesson.title}
                        done={status === 'done'}
                      />
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </section>
    </div>
  );
}

function pickContinueLesson(
  all: readonly LessonMeta[],
  progress: Record<string, LessonProgress>,
): LessonMeta | null {
  const started = all.find(
    (l) => !progress[l.id]?.completedAt && countKeysDone(l.stepKeys, progress[l.id]?.stepsDone) > 0,
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
