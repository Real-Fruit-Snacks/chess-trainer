import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { fortressPositions } from './positions';
import type { UseFortress } from './useFortress';

const fake = vi.hoisted((): { fortress: unknown } => ({ fortress: null }));
vi.mock('./useFortress', () => ({ useFortress: () => fake.fortress }));

import FortressPage from './FortressPage';

type Fake = UseFortress & Record<string, unknown>;

function fakeFortress(overrides: Partial<Record<keyof UseFortress, unknown>> = {}): Fake {
  const current = fortressPositions()[0]!;
  return {
    game: {
      position: {
        fen: current.fen,
        turn: current.fen.split(' ')[1] === 'w' ? 'white' : 'black',
        dests: new Map(),
        lastMove: null,
        inCheck: false,
        history: [],
        startFen: current.fen,
      },
      pendingPromotion: null,
    },
    pool: fortressPositions(),
    phase: 'playing',
    current,
    playerColor: current.fen.split(' ')[1] === 'w' ? 'white' : 'black',
    level: { id: 4, name: 'Club' },
    lives: 3,
    held: 0,
    cp: -250,
    movesMade: 5,
    busy: null,
    outcome: null,
    engineStatus: 'ready',
    engineError: null,
    retryEngine: vi.fn(),
    startRun: vi.fn(),
    nextPosition: vi.fn(),
    playerMove: vi.fn(),
    resolvePromotion: vi.fn(),
    giveUp: vi.fn(),
    pgn: () => '*',
    ...overrides,
  } as unknown as Fake;
}

function renderPage() {
  const view = render(
    <MemoryRouter>
      <FortressPage key="page" />
    </MemoryRouter>,
  );
  return (next: Partial<Record<keyof UseFortress, unknown>>) => {
    fake.fortress = { ...(fake.fortress as object), ...next };
    act(() =>
      view.rerender(
        <MemoryRouter>
          <FortressPage key="page" />
        </MemoryRouter>,
      ),
    );
  };
}

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  fake.fortress = fakeFortress();
  useProgress.getState().resetAll();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FortressPage', () => {
  it('asks before giving up a position, which costs a life', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('fortress-give-up'));
    const dialog = screen.getByRole('dialog', { name: 'Give up this position?', hidden: true });
    expect(dialog).toHaveTextContent(
      'It counts as fallen and costs a life: 2 lives left after this.',
    );
    fireEvent.click(within(dialog).getByTestId('confirm-cancel'));
    expect((fake.fortress as Fake).giveUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('fortress-give-up'));
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));
    expect((fake.fortress as Fake).giveUp).toHaveBeenCalledTimes(1);
  });

  it('shows a mate as "M3", not as a number like 99.97', () => {
    const update = renderPage();
    expect(screen.getByTestId('fortress-eval')).toHaveTextContent('−2.5');
    update({ cp: -9997 });
    expect(screen.getByTestId('fortress-eval')).toHaveTextContent('−M3');
    expect(screen.getByTestId('fortress-health')).toHaveAttribute(
      'aria-valuetext',
      '0%, evaluation −M3',
    );
  });

  it('scores a run by the positions held and the engine level', () => {
    const update = renderPage();
    update({ phase: 'over', held: 3, outcome: 'collapsed', lives: 0 });
    expect(useProgress.getState().arcade.fortress).toMatchObject({
      best: 12,
      detail: 'Held 3 positions against Level 4 · Club',
    });
    const result = screen.getByTestId('fortress-result');
    expect(result).toHaveTextContent('12');
    // Play again keeps the level; New game goes back to the setup to choose another.
    fireEvent.click(screen.getByTestId('fortress-again'));
    expect((fake.fortress as Fake).startRun).toHaveBeenCalledWith(expect.any(Number));
    update({ phase: 'over' });
    fireEvent.click(screen.getByTestId('fortress-new'));
    expect(screen.getByLabelText('Engine level')).toBeInTheDocument();
  });
});
