import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import type { LobbyState } from './types';

const made = vi.hoisted(() => ({ room: vi.fn<(kind: string, opts: object) => Promise<string>>() }));
vi.mock('./rooms', () => ({
  makeGroupRoom: (kind: string, opts: object) => made.room(kind, opts),
  raceRoomPath: (id: string) => `/play/race/${id}`,
}));

const post = vi.hoisted(() => vi.fn());
vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({ post }) as unknown as LobbyState) };
});

import { GameDialog } from './GameDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderDialog(props: { room?: boolean } = {}) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/play']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Where />
              <GameDialog open kind="race" invite={false} onClose={onClose} {...props} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  made.room.mockReset();
  post.mockReset();
  useProgress.setState({ puzzleRating: 1180 });
});

describe('the puzzle race’s setup', () => {
  it('posts a race against one opponent, as before', () => {
    renderDialog();
    expect(screen.getByRole('radio', { name: 'One opponent' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ game: 'race', opts: { format: 'best3', level: 1200 } }),
    );
    expect(made.room).not.toHaveBeenCalled();
  });

  it('makes a room for up to eight, and goes to its page', async () => {
    made.room.mockResolvedValue('R'.repeat(22));
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'A room for up to eight' }));
    expect(screen.queryByText('Only people with the link')).toBeNull();
    const format = screen.getByTestId<HTMLSelectElement>('game-dialog-room-format');
    expect([...format.options].map((o) => o.textContent)).toEqual([
      'Five rounds',
      'Three-minute race',
    ]);
    fireEvent.change(format, { target: { value: 'timed' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make the room' }));
      await Promise.resolve();
    });
    expect(made.room).toHaveBeenCalledWith('race', { format: 'timed', level: 1200 });
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe(`/play/race/${'R'.repeat(22)}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(onClose).toHaveBeenCalled();
  });

  it('opens on a room when asked, and says why one could not be made', async () => {
    made.room.mockRejectedValue(new Error('That is enough rooms for now.'));
    renderDialog({ room: true });
    expect(
      screen.getByRole('radio', { name: 'A room for up to eight' }).getAttribute('aria-checked'),
    ).toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make the room' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toBe('That is enough rooms for now.');
    expect(screen.getByTestId('where').textContent).toBe('/play');
  });
});
