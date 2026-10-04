import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import type { CallRecord } from './handAndBrain';
import type { UseHandAndBrain } from './useHandAndBrain';

const fake = vi.hoisted((): { hb: unknown; narrow: boolean } => ({ hb: null, narrow: false }));
vi.mock('./useHandAndBrain', () => ({ useHandAndBrain: () => fake.hb }));

import HandAndBrainPage from './HandAndBrainPage';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Fake = UseHandAndBrain & Record<string, unknown>;

function fakeHb(overrides: Partial<Record<keyof UseHandAndBrain, unknown>> = {}): Fake {
  return {
    game: {
      position: {
        fen: START,
        turn: 'white',
        dests: new Map(),
        lastMove: null,
        inCheck: false,
        history: [],
        startFen: START,
      },
      pendingPromotion: null,
    },
    role: 'brain',
    playerColor: 'white',
    level: { id: 4, name: 'Club' },
    started: true,
    gameOver: null,
    busy: null,
    calls: [],
    handCall: null,
    brainReady: true,
    options: ['n', 'p'],
    dests: new Map(),
    engineStatus: 'ready',
    engineError: null,
    retryEngine: vi.fn(),
    start: vi.fn(),
    callPiece: vi.fn(),
    playerMove: vi.fn(),
    resolvePromotion: vi.fn(),
    resign: vi.fn(),
    pgn: () => '*',
    ...overrides,
  } as unknown as Fake;
}

const call = (ply: number, lossCp: number, grade: CallRecord['grade']): CallRecord => ({
  ply,
  type: 'p',
  san: 'e4',
  bestSan: 'd4',
  bestType: 'p',
  lossCp,
  grade,
});

function renderPage() {
  const view = render(
    <MemoryRouter>
      <HandAndBrainPage key="page" />
    </MemoryRouter>,
  );
  return (next: Partial<Record<keyof UseHandAndBrain, unknown>>) => {
    fake.hb = { ...(fake.hb as object), ...next };
    act(() =>
      view.rerender(
        <MemoryRouter>
          <HandAndBrainPage key="page" />
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
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width') ? fake.narrow : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
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
  fake.hb = fakeHb();
  fake.narrow = false;
  useProgress.getState().resetAll();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HandAndBrainPage', () => {
  it('tells studying the position apart from working out the called move', () => {
    const update = renderPage();
    const status = screen.getByTestId('hb-status');
    update({ busy: 'partner' });
    expect(status).toHaveTextContent('Your partner is studying the position…');
    // After a call these used to swap.
    update({ busy: 'partner-move', calls: [call(1, 0, 'best')] });
    expect(status).toHaveTextContent('Your partner is working out the move…');
    update({ busy: 'partner' });
    expect(status).toHaveTextContent('Your partner is studying the position…');
    update({ busy: null });
    expect(status).toHaveTextContent('Your call: which piece should move?');
  });

  it('puts the piece calls right under the board on a phone', () => {
    fake.narrow = true;
    renderPage();
    const pieces = screen.getByRole('group', { name: 'Call a piece' });
    expect(pieces.closest('.play__boardcol')).not.toBeNull();
    expect(pieces.closest('.trainer__panel')).toBeNull();
  });

  it('keeps the piece calls beside the board on a wide screen', () => {
    renderPage();
    const pieces = screen.getByRole('group', { name: 'Call a piece' });
    expect(pieces.closest('.trainer__panel')).not.toBeNull();
    fireEvent.click(within(pieces).getByRole('button', { name: 'Knight' }));
    expect((fake.hb as Fake).callPiece).toHaveBeenCalledWith('n');
  });

  it('labels the grade of the last call in words', () => {
    renderPage()({ calls: [call(1, 80, 'inaccuracy')] });
    expect(screen.getByTestId('hb-last-call')).toHaveTextContent(/^Inaccuracy/);
    expect(screen.getByTestId('hb-last-call')).not.toHaveTextContent('inaccuracy Pawn');
  });

  it('asks before resigning', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    const dialog = screen.getByRole('dialog', { name: 'Resign this game?', hidden: true });
    expect(dialog).toHaveTextContent('With fewer than 10 calls it is not scored.');
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));
    expect((fake.hb as Fake).resign).toHaveBeenCalledTimes(1);
  });

  it('does not score a resignation after one good call', () => {
    const update = renderPage();
    update({
      calls: [call(1, 0, 'best')],
      gameOver: { result: '0-1', reason: 'resignation', verdict: 'loss' },
    });
    expect(useProgress.getState().arcade['hand-and-brain']).toBeUndefined();
    expect(screen.getByTestId('hb-score-note')).toHaveTextContent(
      'Resigned before 10 calls, so the game is not scored.',
    );
  });

  it('scores a full game by accuracy and engine level', () => {
    const update = renderPage();
    const calls = Array.from({ length: 30 }, (_, i) => call(i * 2 + 1, 20, 'good'));
    update({ calls, gameOver: { result: '1-0', reason: 'checkmate', verdict: 'win' } });
    // 90% × level 4 × a full game.
    expect(useProgress.getState().arcade['hand-and-brain']).toMatchObject({
      best: 360,
      detail: 'Brain · 90% over 30 calls · beat Level 4',
    });
    expect(screen.getByTestId('hb-result')).toHaveTextContent('360');
    expect(screen.getByTestId('hb-scoring')).toHaveTextContent(
      'Score: your accuracy × the engine level',
    );
  });
});
