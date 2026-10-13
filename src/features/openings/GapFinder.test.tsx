import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Chess } from 'chess.js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';
import { useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';
import { positionKey } from './model';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn(), playMoveSound: vi.fn() }));

/** The board is a chessground instance; a stub that hands its props to the test. */
const board = vi.hoisted(() => ({
  props: null as null | {
    fen?: string;
    onMove?: (from: string, to: string) => void;
    autoShapes?: { orig: string; dest?: string }[];
    ariaLabel?: string;
  },
}));
vi.mock('@/components/board/Board', () => ({
  Board: (props: { ariaLabel?: string }) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

import RepertoirePage from './RepertoirePage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

function fenAfter(line: string): string {
  const chess = new Chess();
  for (const san of line.split(' ').filter(Boolean)) chess.move(san);
  return chess.fen();
}

/** Games per move as [games, White's wins] (the rest Black's), and games of unlisted moves. */
type Moves = Record<string, [number, number]>;

/**
 * A stand-in for the explorer: answers by position (the line reaching it), an
 * empty answer elsewhere, and a 429 or a 401 where a test asks for one.
 */
function stubExplorer(
  table: Record<string, Moves>,
  { limitOnce = null, refuse = false }: { limitOnce?: string | null; refuse?: boolean } = {},
) {
  const answers = new Map(
    Object.entries(table).map(([line, moves]) => [positionKey(fenAfter(line)), moves]),
  );
  const limited = new Set<string>();
  const asked: string[] = [];
  const fetchMock = vi.fn((url: string) => {
    const fen = new URL(url).searchParams.get('fen') ?? '';
    const key = positionKey(fen);
    asked.push(key);
    if (refuse) return Promise.resolve(new Response('', { status: 401 }));
    if (limitOnce !== null && key === positionKey(fenAfter(limitOnce)) && !limited.has(key)) {
      limited.add(key);
      return Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '3' } }));
    }
    const moves = answers.get(key) ?? {};
    const rows = Object.entries(moves).map(([san, [games, whiteWins]]) => ({
      uci: '',
      san,
      white: whiteWins,
      draws: 0,
      black: games - whiteWins,
    }));
    const body = {
      white: rows.reduce((sum, r) => sum + r.white, 0),
      draws: 0,
      black: rows.reduce((sum, r) => sum + r.black, 0),
      moves: rows,
      topGames: [],
      opening: null,
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, asked };
}

function seed(pgn: string, id = 'custom-gaps') {
  useRepertoire.setState({
    custom: [{ id, name: 'My Italian', color: 'white', pgn, createdAt: 0 }],
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/openings/:repertoireId" element={<RepertoirePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const status = () => document.querySelector('[data-testid="gap-finder"] [role="status"]');
const gapItems = () => [...document.querySelectorAll<HTMLElement>('.gaps__item')];
const toasts = () => useToasts.getState().toasts.map((t) => t.message);

describe('the gap finder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRepertoire.setState({ cards: {}, custom: [], sessions: [] });
    useSettings.getState().reset();
    useToasts.setState({ toasts: [] });
    board.props = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks to turn the explorer on, saying what is sent, then lists the gaps most often met first', async () => {
    seed('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 *');
    const { fetchMock } = stubExplorer({
      e4: { e5: [500, 250], c5: [300, 150], e6: [120, 60], c6: [60, 30], d5: [20, 10] },
      'e4 e5 Nf3': { Nc6: [700, 350], Nf6: [150, 75], d6: [80, 40], a6: [40, 20], Bc5: [30, 15] },
      'e4 e5 Nf3 Nc6 Bc4': {
        Bc5: [400, 200],
        Nf6: [450, 225],
        Be7: [100, 50],
        d6: [40, 20],
        h6: [10, 5],
      },
    });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));

    const finder = screen.getByTestId('gap-finder');
    expect(finder).toHaveTextContent('Only the positions are sent.');
    expect(finder).toHaveTextContent('3 positions, under a minute');
    expect(within(finder).getByRole('link', { name: 'connect yours in Settings' })).toHaveAttribute(
      'href',
      '/settings#lichess',
    );
    expect(within(finder).getByRole('radio', { name: 'Lichess players' })).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Turn on the explorer and find gaps' }));
    expect(useSettings.getState().explorer).toBe(true);
    expect(status()).toHaveTextContent('Finding gaps…');
    expect(screen.getByRole('progressbar', { name: 'Positions checked' })).toBeInTheDocument();
    await flush();
    expect(finder).toHaveTextContent('1 of 3 positions');
    await flush(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/lichess');
    expect(status()).toHaveTextContent('Done: 6 gaps found.');

    const results = screen.getByTestId('gap-results');
    expect(results).toHaveTextContent('6 gaps up to move 12');
    expect(results).toHaveTextContent('An answer is ready in 30% of games up to move 12.');
    const items = gapItems();
    expect(items.map((li) => li.querySelector('.gaps__reply')?.textContent)).toEqual([
      '1... c5',
      '1... e6',
      '2... Nf6',
      '1... c6',
      '2... d6',
      '3... Be7',
    ]);
    expect(items[0]).toHaveTextContent(
      'Played in 30% of 1,000 games · comes up in about 1 game in 3',
    );
    expect(items[2]).toHaveTextContent('after 1. e4 e5 2. Nf3');

    // The first gap is on the board, the reply drawn as an arrow; picking another shows it.
    expect(board.props?.fen).toBe(fenAfter('e4'));
    expect(board.props?.autoShapes).toEqual([{ orig: 'c7', dest: 'c5', brush: 'yellow' }]);
    const nf6 = within(items[2] as HTMLElement).getByRole('button', { name: /2\.\.\. Nf6/ });
    fireEvent.click(nf6);
    expect(nf6).toHaveAttribute('aria-pressed', 'true');
    expect(board.props?.fen).toBe(fenAfter('e4 e5 Nf3'));

    // Asked again, the answers come from the session's cache.
    fireEvent.click(screen.getByRole('button', { name: 'Back to training' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    expect(screen.getByTestId('gap-results')).toHaveTextContent('6 gaps up to move 12');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops when asked, and goes on later from where it stopped', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. d4 d5 2. c4 e6 3. Nc3 Nf6 (3... c5 4. cxd5) 4. Bg5 *');
    const { fetchMock } = stubExplorer({
      d4: { d5: [500, 250], Nf6: [500, 250] },
      'd4 d5 c4': { e6: [600, 300], c6: [300, 150], dxc4: [100, 50] },
      'd4 d5 c4 e6 Nc3': { Nf6: [700, 350], c5: [200, 100], Be7: [100, 50] },
    });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent('Stopped after 1 of 3 positions.');
    expect(screen.getByTestId('gap-results')).toHaveTextContent(
      'Gaps so far, from 1 of 3 positions.',
    );
    expect(gapItems()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Check the other 2 positions' }));
    await flush(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('gap-results')).toHaveTextContent('4 gaps up to move 12');
  });

  it('waits as long as a 429 asks, saying so, and goes on by itself', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. Nf3 d5 2. g3 Nf6 3. Bg2 c5 4. O-O *');
    const { asked } = stubExplorer(
      {
        Nf3: { d5: [800, 400], Nf6: [200, 100] },
        'Nf3 d5 g3': { Nf6: [900, 450], c6: [100, 50] },
        'Nf3 d5 g3 Nf6 Bg2': { c5: [800, 400], e6: [200, 100] },
      },
      { limitOnce: 'Nf3 d5 g3' },
    );
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(500);
    expect(screen.getByTestId('gap-finder')).toHaveTextContent(
      'Lichess asked for a pause: going on in 3 s.',
    );
    expect(status()).toHaveTextContent('Lichess asked for a pause. The search goes on by itself.');
    await flush(3000);
    await flush(1000);
    expect(asked).toHaveLength(4);
    expect(status()).toHaveTextContent('Done: 3 gaps found.');
  });

  it('answers a gap in the editor: the explorer’s best answer is one tap, or play your own', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. c4 e5 2. Nc3 Nf6 3. g3 *');
    stubExplorer({
      c4: { e5: [500, 250], c5: [300, 150], Nf6: [200, 100] },
      'c4 e5 Nc3': { Nf6: [800, 400], Nc6: [200, 100] },
      // White's answers to 1...c5: Nc3 scores best of those played enough.
      'c4 c5': { Nf3: [500, 260], Nc3: [400, 232], g3: [40, 30] },
    });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(2000);
    expect(gapItems().map((li) => li.querySelector('.gaps__reply')?.textContent)).toEqual([
      '1... c5',
      '1... Nf6',
      '2... Nc6',
    ]);

    fireEvent.click(
      within(gapItems()[0] as HTMLElement).getByRole('button', { name: 'Add an answer' }),
    );
    const card = screen.getByTestId('gap-answer');
    expect(within(card).getByRole('heading')).toHaveTextContent('Your answer to 1... c5');
    expect(card).toHaveTextContent('Played in 30% of 1,000 games.');
    // The board: the position after the reply, the learner's move to play.
    expect(board.props?.fen).toBe(fenAfter('c4 c5'));
    await flush(500);
    expect(card).toHaveTextContent(
      'Best results in Lichess games: White scores 58% with it, in 400 games.',
    );
    expect(board.props?.autoShapes).toEqual([{ orig: 'b1', dest: 'c3', brush: 'green' }]);
    fireEvent.click(within(card).getByRole('button', { name: 'Add 1... c5 2. Nc3' }));

    expect(useRepertoire.getState().custom[0]?.pgn).toMatch(/\(1\.\.\. c5 2\. Nc3\)/);
    expect(toasts()).toContain('Added 1... c5 2. Nc3.');
    // Back to the list, without that gap.
    expect(gapItems().map((li) => li.querySelector('.gaps__reply')?.textContent)).toEqual([
      '1... Nf6',
      '2... Nc6',
    ]);

    // The learner's own move, played on the board.
    fireEvent.click(
      within(gapItems()[0] as HTMLElement).getByRole('button', { name: 'Add an answer' }),
    );
    expect(board.props?.fen).toBe(fenAfter('c4 Nf6'));
    act(() => board.props?.onMove?.('g2', 'g3'));
    expect(useRepertoire.getState().custom[0]?.pgn).toMatch(/\(1\.\.\. Nf6 2\. g3\)/);
    expect(gapItems().map((li) => li.querySelector('.gaps__reply')?.textContent)).toEqual([
      '2... Nc6',
    ]);
  });

  it('offers an editable copy of a built-in repertoire first, which takes its progress', async () => {
    useSettings.getState().update({ explorer: true });
    useRepertoire.setState({
      cards: {
        'scandinavian|e2e4 d7d5': {
          ease: 2.5,
          interval: 3,
          due: Date.now() + 86_400_000,
          reps: 2,
          lapses: 0,
          lastReviewed: 0,
        },
      },
    });
    // The Scandinavian (Black): after 1. e4 d5 White's 2. Nf3 is not in it.
    stubExplorer({
      'e4 d5': { exd5: [800, 400], Nf3: [100, 50], e5: [100, 50] },
      'e4 d5 Nf3': { dxe4: [600, 300], Nf6: [400, 200] },
    });
    renderAt('/openings/scandinavian');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(60_000);
    expect(screen.getByTestId('gap-results')).toHaveTextContent('1 gap up to move 12');
    expect(screen.getByTestId('gap-results')).toHaveTextContent(
      'Only lines after 1. e4 are checked',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add an answer' }));
    const dialog = document.querySelector<HTMLElement>('dialog[open]');
    if (!dialog) throw new Error('No dialog is open');
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Make your own copy?');
    expect(dialog).toHaveTextContent('“Scandinavian Defence (my copy)”');
    expect(dialog).toHaveTextContent('The 1 move you have learned here move to the copy');
    fireEvent.click(within(dialog).getByTestId('confirm-accept'));

    const [copy] = useRepertoire.getState().custom;
    expect(copy?.name).toBe('Scandinavian Defence (my copy)');
    expect(Object.keys(useRepertoire.getState().cards)).toEqual([`${copy?.id}|e2e4 d7d5`]);
    // The copy's page, on the gap.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Scandinavian Defence (my copy)',
    );
    const card = screen.getByTestId('gap-answer');
    expect(within(card).getByRole('heading')).toHaveTextContent('Your answer to 2. Nf3');
    await flush(500);
    fireEvent.click(within(card).getByRole('button', { name: 'Add 2. Nf3 dxe4' }));
    expect(useRepertoire.getState().custom[0]?.pgn).toMatch(/\(2\. Nf3 dxe4\)/);
    expect(toasts()).toContain('Added 2. Nf3 dxe4.');
  });

  it('says so when there are no gaps, and answers another depth from the cache', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. g3 d5 (1... e5 2. Bg2) 2. Bg2 *');
    const { fetchMock } = stubExplorer({ g3: { d5: [700, 350], e5: [300, 150] } });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(500);
    const results = screen.getByTestId('gap-results');
    expect(within(results).getByRole('heading', { name: 'No gaps up to move 12' })).toBeVisible();
    expect(results).toHaveTextContent('An answer is ready in 100% of games up to move 12.');
    expect(status()).toHaveTextContent('Done: no gaps found.');

    fireEvent.click(screen.getByRole('radio', { name: '8' }));
    expect(screen.getByRole('radio', { name: '8' })).toBeChecked();
    expect(
      within(screen.getByTestId('gap-results')).getByRole('heading', {
        name: 'No gaps up to move 8',
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the eight most often met first, and the rest on request', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. f4 d5 2. Nf3 *');
    // Eleven replies to 1. f4, each in over 5% of the games, and only 1...d5 answered.
    const others = ['e5', 'Nf6', 'c5', 'g6', 'e6', 'd6', 'Nc6', 'c6', 'b6', 'g5', 'f5'];
    stubExplorer({
      f4: Object.fromEntries([
        ['d5', [400, 200]],
        ...others.map((san): [string, [number, number]] => [san, [60, 30]]),
      ]),
    });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(500);
    // (The depth an earlier test chose is kept for the session.)
    expect(screen.getByTestId('gap-results')).toHaveTextContent(/11 gaps up to move \d+/);
    expect(gapItems()).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 11 gaps' }));
    expect(gapItems()).toHaveLength(11);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('says what to do when the explorer wants a Lichess account', async () => {
    useSettings.getState().update({ explorer: true });
    seed('1. b3 e5 2. Bb2 Nc6 3. e3 *');
    stubExplorer({}, { refuse: true });
    renderAt('/openings/custom-gaps');
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find gaps' }));
    await flush(500);
    const finder = screen.getByTestId('gap-finder');
    expect(finder).toHaveTextContent('The Lichess opening explorer needs a Lichess account.');
    expect(within(finder).getByRole('link', { name: 'Lichess in Settings' })).toHaveAttribute(
      'href',
      '/settings#lichess',
    );
    expect(within(finder).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
