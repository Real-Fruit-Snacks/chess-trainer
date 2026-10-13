import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLichess } from '@/store/lichess';
import { LichessPending } from './LichessPending';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

describe('results waiting for Lichess', () => {
  beforeEach(() => {
    localStorage.clear();
    useLichess.getState().forget();
    useLichess
      .getState()
      .connect(
        { id: 'learner', username: 'Learner', token: 'lip_x', expiresAt: null },
        { puzzle: null, bullet: null, blitz: null, rapid: null, classical: null, at: 0 },
      );
  });

  afterEach(() => setOnline(true));

  it('says how many wait while the device is offline, and nothing otherwise', () => {
    setOnline(false);
    const { rerender } = render(<LichessPending />);
    expect(screen.queryByTestId('lichess-pending')).toBeNull();
    act(() => {
      useLichess.getState().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true });
      useLichess.getState().notePuzzle({ id: 'BBBBB', solved: false, clean: true, rated: true });
    });
    rerender(<LichessPending />);
    expect(screen.getByTestId('lichess-pending')).toHaveTextContent(
      'Offline: 2 puzzle results wait here and go to Lichess when this device is back online.',
    );
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByTestId('lichess-pending')).toBeNull();
  });
});
