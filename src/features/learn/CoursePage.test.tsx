import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProgress } from '@/store/progress';
import CoursePage from './CoursePage';
import { getLessonMeta } from './lessonMeta';

function renderCourse(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/learn/course/:courseId" element={<CoursePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CoursePage', () => {
  beforeEach(() => useProgress.getState().resetAll());

  it('uses the shared not-found page for an unknown course', () => {
    renderCourse('/learn/course/no-such-course');
    expect(screen.getByRole('heading', { level: 1, name: 'Course not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Learn' })).toHaveAttribute('href', '/learn');
    expect(document.title).toMatch(/^Course not found · /);
  });

  it('names each item with what its row shows and links lessons with the course', () => {
    const meta = getLessonMeta('the-board');
    expect(meta).toBeDefined();
    renderCourse('/learn/course/first-steps');
    const link = screen.getByRole('link', {
      name: `Lesson: ${meta?.title}, ${meta?.minutes} min · ${meta?.category}`,
    });
    expect(link).toHaveAttribute('href', '/learn/the-board?course=first-steps');
    expect(
      screen.getByRole('link', {
        name: 'Checkpoint: solve 5 Hanging piece puzzles, 0 of 5 solved',
      }),
    ).toBeInTheDocument();
  });

  it('says in the name when an item is done', () => {
    const meta = getLessonMeta('the-board');
    useProgress.setState({
      lessons: { 'the-board': { stepsDone: [], completedAt: 1, lastVisitedAt: 1 } },
    });
    renderCourse('/learn/course/first-steps');
    expect(
      screen.getByRole('link', {
        name: `Lesson: ${meta?.title} (done), ${meta?.minutes} min · ${meta?.category}`,
      }),
    ).toBeInTheDocument();
  });
});
