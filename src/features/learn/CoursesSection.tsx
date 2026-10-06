import { useMemo } from 'react';
import { Link } from 'react-router';
import { Badge, ProgressBar } from '@/components/ui';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { courseStatus } from './courseProgress';
import { COURSES } from './courses';
import { LEVEL_LABELS } from './model';

/** The three guided paths, with progress, at the top of the Learn page. */
export function CoursesSection() {
  const progress = useProgress();
  const cards = useRepertoire((s) => s.cards);
  const statuses = useMemo(
    () => COURSES.map((c) => courseStatus(c, progress, cards)),
    [progress, cards],
  );
  return (
    <section className="learn__courses" aria-labelledby="courses-title">
      <div className="learn__level-header">
        <div>
          <h2 id="courses-title">Courses</h2>
          <p className="muted">
            Guided paths that mix lessons, drills, puzzles and games, with a checkpoint at the end
            of every unit.
          </p>
        </div>
      </div>
      <div className="learn__grid">
        {statuses.map((status) => (
          <Link
            key={status.course.id}
            to={`/learn/course/${status.course.id}`}
            className="card card--interactive learn__course"
            data-testid={`course-${status.course.id}`}
          >
            <div className="row row--between">
              <Badge tone="accent">{LEVEL_LABELS[status.course.level].title}</Badge>
              <span className="small muted">
                {status.units.length} units · {status.totalItems} steps
              </span>
            </div>
            <span className="card__title">{status.course.title}</span>
            <p className="small muted">{status.course.blurb}</p>
            <div className="learn__course-progress">
              <ProgressBar
                value={status.doneItems}
                max={status.totalItems}
                label={`${status.course.title} progress`}
              />
              <span className="small muted learn__course-count">
                {status.doneItems}/{status.totalItems}
              </span>
            </div>
            <span className="learn__course-next">
              {status.next
                ? `${status.doneItems ? 'Continue' : 'Start'}: ${status.next.title}`
                : 'Course complete'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
