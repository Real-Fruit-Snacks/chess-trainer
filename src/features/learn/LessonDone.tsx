import { useCallback } from 'react';
import { Button, Icon } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { useProgress } from '@/store/progress';

/**
 * Marks a lesson done without working through it, or not done again, and
 * offers an Undo in the toast that says so.
 */
function useToggleLessonDone(): (lessonId: string, title: string, done: boolean) => void {
  const markDone = useProgress((s) => s.markLessonDone);
  const markNotDone = useProgress((s) => s.markLessonNotDone);
  const restore = useProgress((s) => s.restoreLesson);
  return useCallback(
    (lessonId, title, done) => {
      const previous = useProgress.getState().lessons[lessonId];
      if (done) markNotDone(lessonId);
      else markDone(lessonId);
      toast(
        done
          ? `“${title}” is marked not done: it starts again from the first step.`
          : `“${title}” is marked done.`,
        {
          tone: done ? 'neutral' : 'success',
          actionLabel: 'Undo',
          onAction: () => restore(lessonId, previous),
        },
      );
    },
    [markDone, markNotDone, restore],
  );
}

/**
 * The round check beside a lesson in a list (the Learn page, a course): ticked
 * when the lesson is done, and a tap marks it done or not done.
 */
export function LessonCheck({
  lessonId,
  title,
  done,
  className,
}: {
  lessonId: string;
  title: string;
  done: boolean;
  className?: string;
}) {
  const toggle = useToggleLessonDone();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Mark as done: ${title}`}
      title={done ? 'Mark as not done' : 'Mark as done'}
      className={['lesson-check', done && 'is-done', className].filter(Boolean).join(' ')}
      onClick={() => toggle(lessonId, title, done)}
      data-testid={`lesson-check-${lessonId}`}
    >
      <Icon name="check" size={14} />
    </button>
  );
}

/** The lesson page's own switch: "Mark as done", or "Mark as not done" once it is. */
export function LessonDoneButton({
  lessonId,
  title,
  done,
}: {
  lessonId: string;
  title: string;
  done: boolean;
}) {
  const toggle = useToggleLessonDone();
  return (
    <Button
      size="sm"
      variant={done ? 'ghost' : 'secondary'}
      onClick={() => toggle(lessonId, title, done)}
      data-testid="lesson-done-toggle"
    >
      {done ? null : <Icon name="check" size={16} />}
      <span>{done ? 'Mark as not done' : 'Mark as done'}</span>
    </Button>
  );
}
