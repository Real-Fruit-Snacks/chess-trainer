import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as DrillGameModule from './useDrillGame';
import type { DrillResultInfo, UseDrillGame } from './useDrillGame';
import EndgameDrillPage from './EndgameDrillPage';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

const state = vi.hoisted(() => ({
  fen: '8/8/8/8/8/1K6/P7/4k3 w - - 0 1',
  result: null as DrillResultInfo | null,
}));

vi.mock('./useDrillGame', async (importOriginal) => {
  const actual = await importOriginal<typeof DrillGameModule>();
  const game = {
    position: {
      fen: state.fen,
      turn: 'white',
      dests: new Map(),
      lastMove: null,
      inCheck: false,
      checkedKing: null,
      status: { over: false },
      history: [],
      startFen: state.fen,
    },
    pendingPromotion: null,
  };
  return {
    ...actual,
    useDrillGame: (): Partial<UseDrillGame> => ({
      game: game as unknown as UseDrillGame['game'],
      drill: null,
      phase: state.result ? state.result.outcome : 'idle',
      result: state.result,
      startFen: state.fen,
      userMoves: state.result?.moves ?? 0,
      thinking: false,
      engineStatus: 'ready',
      engineError: null,
      hintShapes: [],
      hinting: false,
      start: vi.fn(),
      restart: vi.fn(),
      playerMove: vi.fn(),
      resolvePromotion: vi.fn(),
      hint: vi.fn(),
      giveUp: vi.fn(),
      retryEngine: vi.fn(),
    }),
  };
});

beforeAll(() => {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

function renderDrill(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/drills/endgame/:drillId" element={<EndgameDrillPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EndgameDrillPage', () => {
  it('announces the outcome and puts the keyboard on what comes next', () => {
    state.result = { outcome: 'lost', reason: 'The pawn was captured.', moves: 7, score: 0 };
    renderDrill('/drills/endgame/kp-run');
    expect(screen.getByTestId('drill-outcome')).toHaveTextContent(
      'Not this time: The pawn was captured.',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New position' }));
    // The engine-loading line and the outcome are not doubled up.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('keeps an empty live region in the page before the drill ends', () => {
    state.result = null;
    renderDrill('/drills/endgame/kp-run');
    expect(screen.getByTestId('drill-outcome')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows a not-found page with a heading and a way back for an unknown drill', () => {
    renderDrill('/drills/endgame/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'Drill not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All drills' })).toHaveAttribute('href', '/drills');
  });
});
