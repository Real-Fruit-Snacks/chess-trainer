import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

/** What the engine hook reports (a test can make it fail). */
interface EngineState {
  status: 'ready' | 'error';
  error: Error | null;
}
const engineState: EngineState = vi.hoisted(() => ({ status: 'ready', error: null }));

// An engine that is ready and never needed: the learner mates in one.
vi.mock('@/engine/useEngine', () => {
  const client = {
    init: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    newGame: () => Promise.resolve(),
    stop: () => undefined,
    search: () => ({ id: 1, stop: () => undefined, result: new Promise(() => undefined) }),
  };
  const engine = () => client;
  return {
    useEngine: () => ({
      engine,
      status: engineState.status,
      error: engineState.error,
      start: () => Promise.resolve(),
    }),
  };
});

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | { onMove?: (from: string, to: string) => void; className?: string },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { onMove?: (from: string, to: string) => void; ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import { EngineCrashedError } from '@/engine/EngineClient';
import { readHandoff } from '@/lib/handoff';
import PlayPage from './PlayPage';

// jsdom has no modal dialogs. Like a browser, `close()` fires its `close` event in a later task —
// which is what made a dialog closed by a new game dismiss the next game's result.
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

/** White mates in one with Qa8#. */
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/Q5K1 w - - 0 1';
/** Black mates in one with ...Qb1#. */
const BLACK_MATES_IN_ONE = '1q4k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';

/** The open dialog with this heading, or null. */
function openDialog(title: string): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>('dialog[open]')) {
    if (dialog.querySelector('h2')?.textContent === title) return dialog;
  }
  return null;
}

/** Lets the dialogs' close events (a later task) arrive. */
const nextTask = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

function renderPlay(path = `/play?fen=${encodeURIComponent(MATE_IN_ONE)}&color=white`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play" element={<PlayPage />} />
        <Route path="/analyze" element={<p>Analysis board</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlayPage', () => {
  beforeEach(() => {
    useProgress.getState().resetAll();
    useSettings.getState().reset();
    board.props = null;
    engineState.status = 'ready';
    engineState.error = null;
    sessionStorage.clear();
  });

  it('"Play again" repeats the game, and the next result opens the dialog again', async () => {
    renderPlay();
    const setup = openDialog('New game')!;
    expect(within(setup).getByLabelText('Engine level')).toBeInTheDocument();
    expect(setup).toHaveTextContent('The rating in brackets is a rough guide');
    fireEvent.click(within(setup).getByRole('button', { name: 'Start' }));
    await nextTask();

    act(() => board.props?.onMove?.('a1', 'a8'));
    const result = openDialog('You won!');
    expect(result).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Take back' })).toBeDisabled();
    fireEvent.click(within(result!).getByRole('button', { name: 'Play again' }));
    await nextTask();
    expect(openDialog('You won!')).toBeNull();
    expect(openDialog('New game')).toBeNull();

    act(() => board.props?.onMove?.('a1', 'a8'));
    expect(openDialog('You won!')).not.toBeNull();
    expect(useProgress.getState().games).toHaveLength(2);

    // "New game" opens the setup instead.
    fireEvent.click(within(openDialog('You won!')!).getByRole('button', { name: 'New game' }));
    await nextTask();
    expect(openDialog('You won!')).toBeNull();
    expect(openDialog('New game')).toHaveTextContent('Starting from a custom position');
  });

  it('asks before resigning, with "Keep playing" first', async () => {
    renderPlay();
    fireEvent.click(within(openDialog('New game')!).getByRole('button', { name: 'Start' }));
    await nextTask();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    const confirm = openDialog('Resign this game?')!;
    const buttons = within(confirm)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons.indexOf('Keep playing')).toBeLessThan(buttons.indexOf('Resign'));
    fireEvent.click(within(confirm).getByTestId('confirm-cancel'));
    await nextTask();
    expect(useProgress.getState().games).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    fireEvent.click(within(openDialog('Resign this game?')!).getByTestId('confirm-accept'));
    await nextTask();
    expect(openDialog('Game over')).toHaveTextContent('by resignation');
    expect(useProgress.getState().games).toHaveLength(1);
  });

  it('lifts the blindfold at the end, and hands the game to analysis from the learner’s side', async () => {
    useSettings.getState().update({ playBlindfold: true });
    renderPlay(`/play?fen=${encodeURIComponent(BLACK_MATES_IN_ONE)}`);
    fireEvent.click(within(openDialog('New game')!).getByRole('button', { name: 'Start' }));
    await nextTask();
    expect(board.props?.className).toBe('board--blindfold');
    act(() => board.props?.onMove?.('b8', 'b1'));
    const result = openDialog('You won!')!;
    expect(board.props?.className).toBeUndefined();
    fireEvent.click(within(result).getByRole('button', { name: 'Analyze game' }));
    await nextTask();
    expect(screen.getByText('Analysis board')).toBeInTheDocument();
    expect(readHandoff()?.orientation).toBe('black');
  });

  it('asks "checks, captures, threats?" before a hanging move when the blunder check is on', async () => {
    renderPlay();
    const setup = openDialog('New game')!;
    const toggle = within(setup).getByRole('switch', { name: 'Blunder check' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(useSettings.getState().playBlunderCheck).toBe(true);
    fireEvent.click(within(setup).getByRole('button', { name: 'Start' }));
    await nextTask();
    expect(screen.getByText(/Blunder check on/)).toBeInTheDocument();

    // 1.Qf6?? puts the queen where the g-pawn takes it.
    act(() => board.props?.onMove?.('a1', 'f6'));
    const alert = screen.getByTestId('blunder-alert');
    expect(alert).toHaveTextContent(
      'Checks, captures, threats? Before you play Qf6: one of your opponent’s answers wins material.',
    );
    fireEvent.click(within(alert).getByRole('button', { name: 'Show me' }));
    expect(screen.getByTestId('blunder-alert')).toHaveTextContent(
      'gxf6 takes your queen, and you end up 9 pawns down.',
    );
    fireEvent.click(
      within(screen.getByTestId('blunder-alert')).getByRole('button', { name: 'Look again' }),
    );
    expect(screen.queryByTestId('blunder-alert')).toBeNull();

    act(() => board.props?.onMove?.('a1', 'a8'));
    const result = openDialog('You won!')!;
    expect(within(result).getByTestId('blunder-summary')).toHaveTextContent(
      'The blunder check held back 1 move.',
    );
    expect(useProgress.getState().blunderChecks).toEqual({ stopped: 1, playedAnyway: 0 });
  });

  it('puts the blunder check right under the board when the panel is stacked below it', async () => {
    // A phone: the side panel sits under the board, out of sight when the move snaps back.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      useSettings.getState().update({ playBlunderCheck: true });
      renderPlay();
      fireEvent.click(within(openDialog('New game')!).getByRole('button', { name: 'Start' }));
      await nextTask();
      act(() => board.props?.onMove?.('a1', 'f6'));
      const alert = screen.getByTestId('blunder-alert');
      expect(alert.closest('.play__boardcol')).not.toBeNull();
      expect(alert.closest('.trainer__panel')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says the engine stopped responding when the worker died mid-game, with Retry', () => {
    engineState.status = 'error';
    engineState.error = new EngineCrashedError('Engine crashed: out of memory');
    renderPlay();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The engine stopped responding.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
