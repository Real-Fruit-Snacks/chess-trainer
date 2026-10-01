import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, LinkButton, ProgressBar, Icon } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { courseStatus } from './courseProgress';
import { getCourse } from './courses';
import { LEVEL_LABELS } from './model';
import './learn.css';

export default function CoursePage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const course = getCourse(courseId);
  const progress = useProgress();
  const cards = useRepertoire((s) => s.cards);
  const status = useMemo(
    () => (course ? courseStatus(course, progress, cards) : null),
    [course, progress, cards],
  );

  useEffect(() => {
    document.title = `${course?.title ?? 'Course'} · ${siteConfig.name}`;
  }, [course]);

  if (!course || !status) {
    return (
      <Card className="narrow">
        <h2>Course not found</h2>
        <LinkButton to="/learn">Back to Learn</LinkButton>
      </Card>
    );
  }

  return (
    <div className="course">
      <p className="small">
        <Link to="/learn">Learn</Link> / Courses
      </p>
      <div className="page-header">
        <div className="row">
          <Badge tone="accent">{LEVEL_LABELS[course.level].title}</Badge>
        </div>
        <h1>{course.title}</h1>
        <p>{course.blurb}</p>
      </div>

      <Card className="course__summary">
        <div className="row row--between">
          <div>
            <strong>
              {status.doneItems} of {status.totalItems} steps done
            </strong>
            <div className="small muted">
              {status.next
                ? `Up next: ${status.next.title} (${status.next.unit.title})`
                : 'You have completed this course.'}
            </div>
          </div>
          {status.next ? (
            <LinkButton variant="primary" to={status.next.to} data-testid="course-continue">
              {status.doneItems ? 'Continue' : 'Start'}
            </LinkButton>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={status.doneItems} max={status.totalItems} label="Course progress" />
        </div>
      </Card>

      <ol className="course__units">
        {status.units.map((unit, index) => (
          <li
            key={unit.unit.id}
            className={`course__unit${unit.done ? ' is-done' : ''}${unit.unlocked ? '' : ' is-locked'}`}
            data-testid={`unit-${unit.unit.id}`}
          >
            <div className="course__unit-header">
              <span className="course__unit-number" aria-hidden="true">
                {unit.done ? <Icon name="check" size={16} /> : index + 1}
              </span>
              <div>
                <h2>{unit.unit.title}</h2>
                <p className="small muted">{unit.unit.blurb}</p>
              </div>
              {!unit.unlocked ? (
                <Badge tone="neutral" className="course__lock">
                  Up next after unit {index}
                </Badge>
              ) : null}
            </div>
            <ul className="course__items">
              {unit.items.map((item) => (
                <li key={`${item.item.type}:${item.to}`}>
                  <Link
                    to={item.to}
                    className={`course__item${item.done ? ' is-done' : ''}`}
                    aria-label={`${item.title}${item.done ? ' (done)' : ''}`}
                  >
                    <span className="course__check" aria-hidden="true">
                      <Icon name={item.done ? 'check' : 'circle'} size={16} />
                    </span>
                    <span className="course__item-body">
                      <span className="course__item-title">{item.title}</span>
                      <span className="small muted">{item.detail}</span>
                      {item.progress && !item.done ? (
                        <ProgressBar
                          value={item.progress.value}
                          max={item.progress.target}
                          label={`${item.title} progress`}
                        />
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
