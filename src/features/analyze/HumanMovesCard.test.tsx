import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchParams, SearchResult } from '@/engine/EngineClient';
import type { MaiaMove } from '@/engine/maia/encoding';
import { useSettings } from '@/store/settings';
import type { CheckMode } from './useHumanMoves';

const maia = vi.hoisted(() => ({
  download: {
    downloaded: true,
    progress: null as { received: number; total: number } | null,
    canStore: true,
    start: vi.fn(),
    stop: vi.fn(),
    remove: vi.fn(),
  },
  status: 'ready',
  predict: vi.fn(),
}));

vi.mock('@/engine/maia/maiaDownload', () => ({ useMaiaDownload: () => maia.download }));
vi.mock('@/engine/maia/maiaClient', () => ({
  maiaClient: () => ({ predict: maia.predict }),
  useMaiaStatus: () => ({ status: maia.status, error: null }),
}));

import { HumanMovesCard } from './HumanMovesCard';

/** White to move: Ne5 walks into dxe5. */
const TRAP = '4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1';
const MOVES: MaiaMove[] = [
  { uci: 'f3e5', san: 'Ne5', probability: 0.6 },
  { uci: 'e1d2', san: 'Kd2', probability: 0.25 },
  { uci: 'f3d4', san: 'Nd4', probability: 0.1 },
  { uci: 'h2h3', san: 'h3', probability: 0.01 },
];
const SCORES: Record<string, number> = { e1d2: 20, f3e5: -480, f3d4: 0 };

function engine() {
  const searches: SearchParams[] = [];
  const client = {
    search: (params: SearchParams) => {
      searches.push(params);
      const lines = new Map(
        (params.searchmoves ?? ['e1d2']).map((uci, i) => [
          i + 1,
          {
            depth: 12,
            multipv: i + 1,
            score: { type: 'cp' as const, value: SCORES[uci] ?? 0 },
            pv: [uci, 'd6e5'],
          },
        ]),
      );
      const result: SearchResult = { bestmove: { move: 'e1d2' }, lines, stopped: false };
      return { id: searches.length, result: Promise.resolve(result), stop: () => undefined };
    },
  };
  return { searches, get: () => client };
}

function renderCard(
  props: Partial<{
    fen: string;
    checkMode: CheckMode;
    hint: string | null;
    gameOver: boolean;
  }> = {},
) {
  const onPlay = vi.fn();
  const fake = engine();
  render(
    <HumanMovesCard
      fen={props.fen ?? TRAP}
      gameOver={props.gameOver ?? false}
      onPlay={onPlay}
      engine={fake.get}
      checkMode={props.checkMode ?? 'auto'}
      hint={props.hint === undefined ? 'e1d2' : props.hint}
    />,
  );
  return { onPlay, fake };
}

beforeEach(() => {
  maia.download.downloaded = true;
  maia.download.progress = null;
  maia.download.canStore = true;
  maia.status = 'ready';
  maia.predict.mockReset();
  maia.predict.mockResolvedValue({ moves: MOVES, value: { win: 0.4, draw: 0.2, loss: 0.4 } });
  useSettings.setState({ analysisHumanMoves: true, analysisHumanRating: 1500 });
});

afterEach(() => {
  useSettings.setState({ analysisHumanMoves: false, analysisHumanRating: 1500 });
});

describe('HumanMovesCard', () => {
  it('is off until switched on, and says what it shows', () => {
    useSettings.setState({ analysisHumanMoves: false });
    renderCard();
    const toggle = screen.getByRole('switch', { name: 'Human moves' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/What players of a chosen rating play here/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Rating of the players')).toBeNull();
    fireEvent.click(toggle);
    expect(useSettings.getState().analysisHumanMoves).toBe(true);
    expect(maia.predict).not.toHaveBeenCalled();
  });

  it('offers the download where the model is missing, and follows it', () => {
    maia.download.downloaded = false;
    const { rerender } = render(
      <HumanMovesCard
        fen={TRAP}
        gameOver={false}
        onPlay={vi.fn()}
        engine={engine().get}
        checkMode="auto"
        hint={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download (25 MB)' }));
    expect(maia.download.start).toHaveBeenCalled();
    maia.download.progress = { received: 12_000_000, total: 25_000_000 };
    rerender(
      <HumanMovesCard
        fen={TRAP}
        gameOver={false}
        onPlay={vi.fn()}
        engine={engine().get}
        checkMode="auto"
        hint={null}
      />,
    );
    expect(screen.getByText('Downloading the human-like model: 12 of 25 MB.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(maia.download.stop).toHaveBeenCalled();
  });

  it('explains when the browser cannot keep the model', () => {
    maia.download.canStore = false;
    maia.download.downloaded = false;
    renderCard();
    expect(screen.getByText(/cannot keep files for the app/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it('shows what players of the rating play, with the engine’s verdicts and the trap', async () => {
    const { onPlay, fake } = renderCard();
    const rows = await screen.findAllByTestId('human-move');
    expect(maia.predict).toHaveBeenCalledWith(TRAP, 1500);
    // The rare h3 is left out.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Ne5');
    expect(rows[0]).toHaveTextContent('60%');
    await waitFor(() => expect(within(rows[0]!).getByText('Blunder')).toBeInTheDocument());
    expect(within(rows[1]!).getByText('Best')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Good')).toBeInTheDocument();
    // The analysis's own best move was searched with them, all at once.
    expect(fake.searches).toEqual([
      { fen: TRAP, depth: 12, multipv: 3, searchmoves: ['e1d2', 'f3e5', 'f3d4'] },
    ]);
    expect(screen.getByTestId('human-moves-trap')).toHaveTextContent(
      'A trap at 1500: most players choose Ne5 (60%), a blunder. Puts the knight where it can simply be taken: dxe5.',
    );
    fireEvent.click(within(rows[1]!).getByRole('button', { name: /Kd2/ }));
    expect(onPlay).toHaveBeenCalledWith('e1d2');
  });

  it('remembers the rating and asks again at the new one', async () => {
    renderCard({ fen: '4k3/8/3p4/8/8/5N2/8/3K4 w - - 0 1' });
    await screen.findAllByTestId('human-move');
    fireEvent.change(screen.getByLabelText('Rating of the players'), { target: { value: '2100' } });
    expect(useSettings.getState().analysisHumanRating).toBe(2100);
    await waitFor(() =>
      expect(maia.predict).toHaveBeenLastCalledWith('4k3/8/3p4/8/8/5N2/8/3K4 w - - 0 1', 2100),
    );
  });

  it('waits for the engine while it is busy, and checks on request when it is off', async () => {
    const fen = '4k3/8/3p4/8/8/5N2/8/2K5 w - - 0 1';
    const waiting = renderCard({ fen, checkMode: 'wait' });
    const rows = await screen.findAllByTestId('human-move');
    expect(within(rows[0]!).getByText('checking…')).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(waiting.fake.searches).toHaveLength(0);
  });

  it('checks on request while the engine is off', async () => {
    const fen = '4k3/8/3p4/8/8/5N2/8/1K6 w - - 0 1';
    const { fake } = renderCard({ fen, checkMode: 'manual', hint: null });
    await screen.findAllByTestId('human-move');
    expect(screen.queryByText('checking…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check these moves' }));
    await waitFor(() => expect(screen.getAllByText('Blunder').length).toBeGreaterThan(0));
    // No analysis to borrow a best move from: the engine finds its own first.
    expect(fake.searches[0]).toEqual({ fen, depth: 12, multipv: 1 });
  });

  it('says so when the engine is not running, the model fails, or the game is over', async () => {
    const fen = '4k3/8/3p4/8/8/5N2/8/K7 w - - 0 1';
    renderCard({ fen, checkMode: 'off' });
    await screen.findAllByTestId('human-move');
    expect(
      screen.getByText('The engine is not running, so the moves are not judged.'),
    ).toBeInTheDocument();
  });

  it('offers to try again when the model cannot start', async () => {
    maia.predict.mockRejectedValueOnce(new Error('out of memory'));
    renderCard({ fen: '4k3/8/3p4/8/8/5N2/8/4K2R w - - 0 1' });
    expect(
      await screen.findByText('The human-like model could not start: out of memory'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('human-move')).toHaveLength(3);
  });

  it('has nothing to show when the game is over', () => {
    renderCard({ gameOver: true });
    expect(screen.getByText('The game is over: there is no move to make.')).toBeInTheDocument();
    expect(maia.predict).not.toHaveBeenCalled();
  });
});
