import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { getLesson } from './lessons';
import { lessonPromise } from './lessons/load';
import { lessonStepKeys, taskStepKeys } from './stepKeys';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

const board = vi.hoisted(() => ({
  props: null as null | {
    fen?: string;
    onMove?: (from: string, to: string) => void;
    shapes?: { orig: string; dest?: string; brush?: string }[];
  },
}));
const hintMarks = () => (board.props?.shapes ?? []).filter((s) => s.brush === 'yellow');
vi.mock('@/components/board/Board', () => ({
  Board: (props: { onMove?: (from: string, to: string) => void; ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import LessonPage from './LessonPage';

function renderLesson(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/learn/:lessonId" element={<LessonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const lesson = getLesson('how-pieces-move')!;

describe('LessonPage', () => {
  // The page loads a lesson's file on demand; loaded once, it renders at once.
  beforeAll(async () => {
    await lessonPromise('how-pieces-move');
    await lessonPromise('basic-checkmates');
  });

  beforeEach(() => {
    useProgress.getState().resetAll();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('lists the steps as an ordered list of buttons, the current one marked', () => {
    renderLesson('/learn/how-pieces-move');
    const steps = screen.getByRole('list', { name: 'Steps' });
    expect(steps.tagName).toBe('OL');
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(lesson.steps.length);
    const first = within(items[0]!).getByRole('button', { name: 'Step 1: The rook' });
    expect(first).toHaveAttribute('aria-current', 'step');
    expect(within(items[1]!).getByRole('button')).not.toHaveAttribute('aria-current');
  });

  it('moves focus to the task prompt when the step changes', () => {
    renderLesson('/learn/how-pieces-move');
    act(() => board.props?.onMove?.('d4', 'h4'));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const prompt = screen.getByTestId('lesson-task');
    expect(prompt).toHaveTextContent('Move the bishop to g7.');
    expect(prompt).toHaveFocus();
  });

  it('offers "Show answer" only while the task waits for a move', () => {
    renderLesson('/learn/how-pieces-move');
    const show = screen.getByRole('button', { name: 'Show answer' });
    expect(show).toBeEnabled();
    act(() => board.props?.onMove?.('d4', 'a4'));
    expect(show).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(show).toBeEnabled();
  });

  it('shows what punishes a wrong move, until it is taken back', () => {
    renderLesson('/learn/how-pieces-move');
    const app = screen.getByRole('application');
    app.focus();
    act(() => board.props?.onMove?.('d4', 'd8'));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId('coach-log')).toHaveTextContent('Black simply takes it with Kxd8');
    expect(board.props?.fen).toBe('3k4/8/8/8/8/8/8/4K3 w - - 0 2');
    const takeBack = screen.getByTestId('lesson-take-back');
    // The way on has the focus (Enter takes it back); the board gets it back after.
    expect(takeBack).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    fireEvent.click(takeBack);
    expect(board.props?.fen).toBe('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1');
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeEnabled();
    expect(app).toHaveFocus();
  });

  it('waits for the learner after a move is explained: Continue (or →) plays the reply', () => {
    renderLesson('/learn/basic-checkmates?step=2');
    const app = screen.getByRole('application');
    app.focus();
    act(() => board.props?.onMove?.('h1', 'h6'));
    expect(screen.getByTestId('coach-why')).toHaveTextContent('So it has to step back.');
    const goOn = screen.getByTestId('lesson-play-on');
    expect(goOn).toHaveTextContent('Continue');
    expect(goOn).toHaveFocus();
    // No question waiting, no hint or answer to give, and nothing moves on by itself.
    expect(screen.queryByTestId('lesson-task')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByTestId('coach-note')).toBeNull();
    expect(board.props?.fen).toBe('8/8/4k2R/R7/8/8/8/6K1 b - - 1 1');
    // The copy under the board (for phones) ends with its own Continue.
    const latest = screen.getByTestId('coach-latest');
    expect(latest).toHaveTextContent('So it has to step back.');
    expect(within(latest).getByRole('button', { name: 'Continue', hidden: true })).toBeVisible();

    fireEvent.click(goOn);
    expect(board.props?.fen).toBe('8/3k4/7R/R7/8/8/8/6K1 w - - 2 2');
    expect(screen.getByTestId('coach-note')).toHaveTextContent('The king steps back');
    expect(screen.getByTestId('lesson-task')).toHaveTextContent('Now the rooks swap roles');
    // Under the board: the answer to going on, the reply's note and the new question.
    expect(latest).not.toHaveTextContent('So it has to step back.');
    expect(latest).toHaveTextContent('Now the rooks swap roles');
    // The board has the focus again, for the next move.
    expect(app).toHaveFocus();

    act(() => board.props?.onMove?.('a5', 'a7'));
    expect(screen.getByTestId('lesson-play-on')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('lesson-task')).toHaveTextContent('checkmate in one');
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();

    // The end of the line: the next step is the way on.
    act(() => board.props?.onMove?.('h6', 'h8'));
    expect(screen.getByTestId('lesson-continue')).toHaveFocus();
    expect(screen.queryByTestId('lesson-play-on')).toBeNull();
  });

  it('plays a line again on a step already done, Continue and all', () => {
    const mates = getLesson('basic-checkmates')!;
    const keys = lessonStepKeys(mates);
    useProgress.getState().markLessonStep(mates.id, keys[1]!, keys, taskStepKeys(mates));
    renderLesson('/learn/basic-checkmates?step=2');
    act(() => board.props?.onMove?.('h1', 'h6'));
    fireEvent.click(screen.getByTestId('lesson-play-on'));
    expect(screen.getByTestId('lesson-task')).toHaveTextContent('Now the rooks swap roles');
  });

  it('ignores letter and arrow shortcuts with a modifier or from the board, in any case', () => {
    renderLesson('/learn/how-pieces-move');
    fireEvent.keyDown(screen.getByRole('application'), { key: 'h' });
    fireEvent.keyDown(window, { key: 'h', metaKey: true });
    expect(hintMarks()).toEqual([]);
    // Caps Lock or Shift does not break it: the piece to move is marked.
    fireEvent.keyDown(window, { key: 'H' });
    expect(hintMarks()).toEqual([{ orig: 'd4', brush: 'yellow' }]);

    act(() => board.props?.onMove?.('d4', 'h4'));
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' });
    expect(screen.getByText(`Step 1 of ${lesson.steps.length}`)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(`Step 2 of ${lesson.steps.length}`)).toBeInTheDocument();
  });

  it('turns the letter shortcuts off with the setting, keeping the arrows', () => {
    useSettings.getState().update({ keyboardShortcuts: false });
    try {
      renderLesson('/learn/how-pieces-move');
      fireEvent.keyDown(window, { key: 'h' });
      expect(hintMarks()).toEqual([]);
      act(() => board.props?.onMove?.('d4', 'h4'));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(`Step 2 of ${lesson.steps.length}`)).toBeInTheDocument();
    } finally {
      useSettings.getState().update({ keyboardShortcuts: true });
    }
  });

  it('ends with "End of lesson", not "Lesson complete", after skipped tasks', () => {
    renderLesson('/learn/how-pieces-move');
    lesson.steps.forEach(() => fireEvent.click(screen.getByRole('button', { name: 'Skip' })));
    const title = screen.getByTestId('lesson-end-title');
    expect(title).toHaveTextContent('End of lesson');
    expect(title).toHaveFocus();
    expect(screen.getByText(/7 tasks still to solve/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 1' }));
    expect(screen.getByTestId('lesson-task')).toHaveTextContent('Slide the rook to h4');
  });

  it('says "Lesson complete" and links recall once every step is done', () => {
    renderLesson('/learn/how-pieces-move');
    lesson.steps.forEach(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Continue|Finish/ }));
    });
    expect(screen.getByTestId('lesson-end-title')).toHaveTextContent('Lesson complete');
    expect(screen.getByTestId('lesson-recall-link')).toHaveAttribute('href', '/learn/recall');
    expect(Object.keys(useProgress.getState().lessonRecall)).toHaveLength(7);
  });

  it('opened from a course, offers "Back to course" and the next item of the course', () => {
    renderLesson('/learn/how-pieces-move?course=first-steps');
    expect(screen.getByTestId('back-to-course')).toHaveAttribute(
      'href',
      '/learn/course/first-steps',
    );
    lesson.steps.forEach(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Continue|Finish/ }));
    });
    const next = screen.getByTestId('next-in-course');
    expect(next).toHaveTextContent('Next in course: Castling, en passant and promotion');
    expect(next).toHaveAttribute('href', '/learn/special-moves?course=first-steps');
    expect(screen.getByRole('link', { name: 'Back to course' })).toHaveAttribute(
      'href',
      '/learn/course/first-steps',
    );
  });

  it('marks the lesson done from its header, and not done again', () => {
    renderLesson('/learn/how-pieces-move');
    fireEvent.click(screen.getByTestId('lesson-done-toggle'));
    const marked = useProgress.getState().lessons['how-pieces-move'];
    expect(marked?.completedAt).not.toBeNull();
    expect(marked?.marked).toBe(true);
    // Not training: nothing scheduled for recall.
    expect(useProgress.getState().lessonRecall).toEqual({});
    expect(screen.getByTestId('lesson-done-toggle')).toHaveTextContent('Mark as not done');
    fireEvent.click(screen.getByTestId('lesson-done-toggle'));
    expect(useProgress.getState().lessons['how-pieces-move']).toMatchObject({
      stepsDone: [],
      completedAt: null,
    });
    expect(screen.getByTestId('lesson-done-toggle')).toHaveTextContent('Mark as done');
  });

  it('says at the end that a marked lesson was only marked, and offers its steps', () => {
    useProgress.getState().markLessonDone('how-pieces-move');
    renderLesson(`/learn/how-pieces-move?step=${lesson.steps.length}`);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByTestId('lesson-end-title')).toHaveTextContent('Marked as done');
    expect(screen.getByRole('button', { name: 'Go to step 1' })).toBeInTheDocument();
  });

  it('completes a marked lesson for real once every step is done', () => {
    useProgress.getState().markLessonDone('how-pieces-move');
    renderLesson('/learn/how-pieces-move');
    lesson.steps.forEach(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Continue|Finish/ }));
    });
    expect(screen.getByTestId('lesson-end-title')).toHaveTextContent('Lesson complete');
    expect(useProgress.getState().lessons['how-pieces-move']?.marked).toBeUndefined();
    expect(Object.keys(useProgress.getState().lessonRecall)).toHaveLength(7);
  });

  it('ignores a course the lesson is not part of', () => {
    renderLesson('/learn/how-pieces-move?course=club-player');
    expect(screen.queryByTestId('back-to-course')).toBeNull();
    // The way back is to all lessons.
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/learn');
  });

  it('shows the shared not-found page with an h1 for an unknown lesson', () => {
    renderLesson('/learn/no-such-lesson');
    expect(screen.getByRole('heading', { level: 1, name: 'Lesson not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to all lessons' })).toHaveAttribute(
      'href',
      '/learn',
    );
  });
});
