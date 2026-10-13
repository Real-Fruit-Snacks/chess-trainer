import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import type { OwnThreat, ThreatPosition } from './threats';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

interface EngineState {
  status: 'ready' | 'error';
  /** Centipawns the fake engine gives each searched move. */
  cps: Record<string, number>;
}
const engineState = vi.hoisted((): EngineState => ({ status: 'ready', cps: {} }));
vi.mock('@/engine/useEngine', () => {
  const client = {
    search: (params: { searchmoves?: string[] }) => {
      const lines = new Map();
      (params.searchmoves ?? []).forEach((uci, i) => {
        const cp = engineState.cps[uci];
        if (cp !== undefined) lines.set(i + 1, { score: { type: 'cp', value: cp }, pv: [uci] });
      });
      return {
        id: 1,
        stop: () => undefined,
        result: Promise.resolve({ stopped: false, bestmove: { move: null }, lines }),
      };
    },
  };
  const engine = () => client;
  return {
    useEngine: () => ({
      engine,
      status: engineState.status,
      error: null,
      start: () => Promise.resolve(),
    }),
  };
});

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | {
    fen: string;
    movableColor?: string;
    autoShapes?: unknown[];
    onMove?: (from: string, to: string) => void;
  },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { ariaLabel?: string }) => {
    board.props = props as typeof board.props;
    return <div role="application" aria-label={props.ariaLabel} />;
  },
}));

/** 1.e4 e5 2.Bc4 Nc6 3.Qh5: Black to move, White threatens Qxf7#; in the game, 3...Nf6. */
const SCHOLAR: ThreatPosition = {
  id: 'scholar',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  threat: 'h5f7',
  line: ['h5f7'],
  defences: ['g7g6', 'd8e7', 'd8f6'],
  game: 'g8f6',
  rating: 1500,
  kind: 'mate',
  motifs: 'mateIn1',
};

vi.mock('./threatData', () => ({ loadThreatPositions: () => Promise.resolve([SCHOLAR]) }));

import ThreatDrillPage from './ThreatDrillPage';

const status = () => screen.getByTestId('threat-status');

async function renderDrill() {
  // Strict mode, as in the app: a mount undone at once must not use up the first position.
  render(
    <StrictMode>
      <MemoryRouter>
        <ThreatDrillPage />
      </MemoryRouter>
    </StrictMode>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function move(from: string, to: string) {
  await act(async () => {
    board.props?.onMove?.(from, to);
    await Promise.resolve();
  });
}

describe('ThreatDrillPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetAll();
    useSettings.getState().reset();
    engineState.status = 'ready';
    engineState.cps = {};
    board.props = null;
  });

  it('asks for the threat on the board with the opponent to move, then for the defence', async () => {
    await renderDrill();
    expect(status()).toHaveTextContent('What does White threaten?');
    // The same pieces, but White to move: the position after a pass.
    expect(board.props?.fen).toBe(
      'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 3 3',
    );
    expect(board.props?.movableColor).toBe('white');

    await move('h5', 'f7');
    expect(status()).toHaveTextContent('Right: Qxf7# mates. Now meet it — your move as Black.');
    expect(board.props?.fen).toBe(SCHOLAR.fen);
    expect(board.props?.movableColor).toBe('black');
    expect(board.props?.autoShapes).toEqual([{ orig: 'h5', dest: 'f7', brush: 'red' }]);

    await move('g7', 'g6');
    expect(status()).toHaveTextContent('Held: g6 meets the threat.');
    const summary = screen.getByTestId('threat-summary');
    expect(summary).toHaveTextContent('Ways to meet it: g6, Qe7, Qf6.');
    expect(summary).toHaveTextContent('In the game, Black played Nf6 and lost to it.');
    expect(useProgress.getState().threatStats).toMatchObject({
      found: 1,
      defended: 1,
      defenceTried: 1,
      run: 1,
    });
    expect(useProgress.getState().drills.threats?.best).toBe(1);
  });

  it('shows the threat after two wrong guesses, and judges an unlisted defence with the engine', async () => {
    engineState.cps = { h5f7: 10_000, h5h7: 50, g7g6: 0, a7a6: -900 };
    await renderDrill();
    await move('h5', 'h7');
    expect(screen.getByTestId('threat-miss')).toHaveTextContent('Not Qxh7. One more try.');
    await move('h5', 'h7');
    expect(status()).toHaveTextContent('The threat: Qxf7# mates. Now meet it');

    await move('a7', 'a6');
    expect(status()).toHaveTextContent('Not enough: after a6, Qxf7# still mates.');
    expect(useProgress.getState().threatStats).toMatchObject({
      found: 0,
      missed: 1,
      defended: 0,
      defenceTried: 1,
    });
  });

  it('accepts a different move that threatens as much, as the engine sees it', async () => {
    // Bxf7+ is not the stored threat, but the engine scores it within a few centipawns.
    engineState.cps = { h5f7: 900, c4f7: 880 };
    await renderDrill();
    await move('c4', 'f7');
    expect(status()).toHaveTextContent('Right:');
  });

  it('starts with a threat from the learner’s own game when one is due', async () => {
    const own: OwnThreat = {
      ...SCHOLAR,
      id: 'threat-own',
      source: { title: 'me – Bot, 2026-10-01', ply: 6, played: 'Nf6', byLearner: true },
      createdAt: 1,
      found: 0,
      missed: 0,
      streak: 0,
    };
    useProgress.getState().addOwnThreats([own]);
    await renderDrill();
    expect(screen.getByText('From your game')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show the threat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip the defence' }));
    expect(screen.getByTestId('threat-summary')).toHaveTextContent(
      'From me – Bot, 2026-10-01, move 3: you played Nf6 and the threat was on.',
    );
    expect(useProgress.getState().ownThreats['threat-own']).toMatchObject({ missed: 1, streak: 0 });
    fireEvent.click(screen.getByRole('button', { name: /Next position/ }));
    await act(async () => {
      await Promise.resolve();
    });
    // The next one is bundled again.
    expect(screen.queryByText('From your game')).toBeNull();
  });

  it('names the side that played the move when the game does not say which was the learner', async () => {
    const own: OwnThreat = {
      ...SCHOLAR,
      id: 'threat-anyone',
      source: { title: 'erin – frank, 2026-09-30', ply: 6, played: 'Nf6' },
      createdAt: 1,
      found: 0,
      missed: 0,
      streak: 0,
    };
    useProgress.getState().addOwnThreats([own]);
    await renderDrill();
    expect(screen.getByText('From a reviewed game')).toBeInTheDocument();
    expect(screen.queryByText('From your game')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show the threat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip the defence' }));
    expect(screen.getByTestId('threat-summary')).toHaveTextContent(
      'From erin – frank, 2026-09-30, move 3: Black played Nf6 and the threat was on.',
    );
  });
});
