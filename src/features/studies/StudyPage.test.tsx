import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import StudyPage from './StudyPage';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

function renderStudy(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/studies/${id}`]}>
      <Routes>
        <Route path="/studies/:studyId" element={<StudyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const status = () => screen.getByTestId('study-status');

describe('StudyPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProgress.getState().resetAll();
    useSettings.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the solution on S in either case, but never on Ctrl+S', () => {
    renderStudy('rook-pin-on-the-file');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(status()).toHaveTextContent('Find the move on the board.');
    fireEvent.keyDown(window, { key: 'S' });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(status()).toHaveTextContent('The solution has been played through.');
    expect(useProgress.getState().studies['rook-pin-on-the-file']).toBeDefined();
  });

  it('leaves the letters alone when single-key shortcuts are off', () => {
    useSettings.getState().update({ keyboardShortcuts: false });
    renderStudy('rook-pin-on-the-file');
    expect(screen.getByRole('button', { name: /Show solution/ }).querySelector('kbd')).toBeNull();
    fireEvent.keyDown(window, { key: 's' });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(status()).toHaveTextContent('Find the move on the board.');
  });

  it('shows a not-found page with a heading and a way back', () => {
    renderStudy('no-such-study');
    expect(screen.getByRole('heading', { level: 1, name: 'Study not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All studies' })).toHaveAttribute('href', '/studies');
  });
});
