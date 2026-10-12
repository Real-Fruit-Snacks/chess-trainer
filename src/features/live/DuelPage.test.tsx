import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocus } from '@/app/focus';
import type * as SoundModule from '@/lib/sound';
import { useSettings } from '@/store/settings';
import { DUEL_RULES } from '../../../relay/src/live/shared.mjs';
import type { DuelView, LobbyState } from './types';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

interface BoardProps {
  fen: string;
  orientation?: string;
  movableColor?: string;
  onMove?: (from: string, to: string) => void;
  ariaLabel?: string;
}
const board = vi.hoisted(() => ({ props: null as BoardProps | null }));
vi.mock('@/components/board/Board', () => ({
  Board: (props: BoardProps) => {
    board.props = props;
    return <div role="application" aria-label={props.ariaLabel} tabIndex={0} />;
  },
}));

const sessions = vi.hoisted(() => ({ byId: new Map<string, unknown>() }));
vi.mock('./sessions', () => ({
  getDuel: (id: string) => sessions.byId.get(id) ?? null,
}));

const clearPairing = vi.hoisted(() => vi.fn());
vi.mock('./lobby', async () => {
  const { create } = await import('zustand');
  return { useLobby: create<LobbyState>()(() => ({}) as LobbyState) };
});

import { playSound } from '@/lib/sound';
import DuelPage from './DuelPage';
import { useLobby } from './lobby';

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

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const puzzles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `pz${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

function makeView(patch: Partial<DuelView> = {}): DuelView {
  return {
    id: 'DUEL',
    connection: 'open',
    missing: false,
    you: 'white',
    host: true,
    white: { name: 'Patient Bishop', rating: 1500 },
    black: { name: 'Swift Knight', rating: 1640 },
    game: 'race',
    opts: { format: 'best3', level: 1500 },
    status: 'setup',
    setupDeadline: null,
    items: null,
    round: 0,
    phase: null,
    phaseEnds: null,
    liveSince: null,
    mine: null,
    theirs: null,
    rounds: [],
    score: { white: 0, black: 0 },
    progress: null,
    result: null,
    reason: null,
    offers: { rematch: null },
    opponentPresent: true,
    chat: [],
    next: null,
    error: null,
    preparing: false,
    ...patch,
  };
}

function makeSession(initial: DuelView) {
  let view = initial;
  const listeners = new Set<() => void>();
  return {
    getView: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    update(patch: Partial<DuelView>) {
      view = { ...view, ...patch };
      act(() => {
        for (const listener of listeners) listener();
      });
    },
    report: vi.fn(),
    abort: vi.fn(),
    resign: vi.fn(),
    rematch: vi.fn(),
    say: vi.fn(),
    close: vi.fn(),
  };
}

function hold(view: DuelView) {
  const session = makeSession(view);
  sessions.byId.set(view.id, session);
  return session;
}

function renderDuel(path = '/play/duel/DUEL') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play" element={<p>Play</p>} />
        <Route path="/play/duel/:gameId" element={<DuelPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openDialog(title: string): HTMLElement | null {
  for (const dialog of document.querySelectorAll<HTMLElement>('dialog[open]')) {
    if (dialog.querySelector('h2')?.textContent === title) return dialog;
  }
  return null;
}

/** Runs the fake clock on, letting React catch up. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('DuelPage', () => {
  beforeEach(() => {
    sessions.byId.clear();
    board.props = null;
    vi.mocked(playSound).mockClear();
    clearPairing.mockClear();
    useLobby.setState(
      {
        connection: 'idle',
        seeks: [],
        players: 0,
        mine: null,
        pairing: null,
        notice: null,
        watch: () => () => undefined,
        post: vi.fn(),
        cancel: vi.fn(),
        join: vi.fn(),
        clearPairing,
        invite: vi.fn(),
        invited: null,
        clearInvited: vi.fn(),
        clearNotice: vi.fn(),
      },
      true,
    );
    useSettings.getState().reset();
    useFocus.setState({ active: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says so when this device has no seat in the duel', () => {
    renderDuel('/play/duel/NOPE');
    expect(screen.getByTestId('duel-absent')).toHaveTextContent('No seat in this duel');
    fireEvent.click(screen.getByRole('link', { name: 'Back to Play' }));
    expect(screen.getByText('Play')).toBeInTheDocument();
  });

  it('waits for the rounds and the opponent, and may be called off meanwhile', () => {
    const session = hold(makeView({ preparing: true }));
    renderDuel();
    expect(screen.getByRole('heading', { level: 1, name: 'Puzzle race' })).toBeVisible();
    expect(screen.getByText('Best of three · 1500 · First to 2 rounds')).toBeVisible();
    expect(screen.getByTestId('duel-setup')).toHaveTextContent('Dealing the rounds');
    expect(screen.getByTestId('duel-status')).toHaveTextContent('Dealing the rounds…');
    session.update({ preparing: false, items: puzzles(5), opponentPresent: false });
    expect(screen.getByTestId('duel-setup')).toHaveTextContent('Waiting for Swift Knight');
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }));
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it('counts down to a round, then races the same puzzle and reports a clean solve', () => {
    vi.useFakeTimers();
    const session = hold(
      makeView({
        status: 'playing',
        items: puzzles(5) as never,
        phase: 'countdown',
        phaseEnds: performance.now() + DUEL_RULES.countdownMs,
      }),
    );
    renderDuel();
    expect(screen.getByTestId('duel-countdown')).toHaveTextContent('Round 1');
    expect(screen.getByTestId('duel-countdown')).toHaveTextContent('3');
    // Nothing to study before the round: an empty board.
    expect(board.props?.fen).toBe('8/8/8/8/8/8/8/8 w - - 0 1');

    session.update({
      phase: 'live',
      phaseEnds: performance.now() + DUEL_RULES.race.roundMs,
      liveSince: performance.now(),
    });
    expect(screen.queryByTestId('duel-countdown')).toBeNull();
    // The opponent's move comes first, as in every puzzle.
    tick(700);
    expect(board.props?.orientation).toBe('black');
    expect(board.props?.movableColor).toBe('black');
    expect(screen.getByTestId('race-status')).toHaveTextContent(
      'Black to play: find the best line.',
    );
    act(() => board.props?.onMove?.('e7', 'e5'));
    tick(400);
    act(() => board.props?.onMove?.('b8', 'c6'));
    expect(session.report).toHaveBeenCalledWith({
      round: 0,
      ok: true,
      ms: expect.any(Number) as number,
    });
    session.update({ mine: { ok: true, ms: 4321 }, theirs: { ok: false, ms: 1000 } });
    expect(screen.getByTestId('race-status')).toHaveTextContent('Solved in 4.32 s.');
    expect(screen.getByTestId('race-status')).toHaveTextContent('Swift Knight missed it.');
  });

  it('reports a wrong move as out of the round', () => {
    vi.useFakeTimers();
    const session = hold(
      makeView({
        status: 'playing',
        items: puzzles(5) as never,
        phase: 'live',
        phaseEnds: performance.now() + 90_000,
        liveSince: performance.now(),
      }),
    );
    renderDuel();
    tick(700);
    act(() => board.props?.onMove?.('d7', 'd5'));
    expect(session.report).toHaveBeenCalledWith({
      round: 0,
      ok: false,
      ms: expect.any(Number) as number,
    });
  });

  it('runs a timed race puzzle after puzzle, with both players’ counts', () => {
    vi.useFakeTimers();
    const session = hold(
      makeView({
        opts: { format: 'timed', level: 1200 },
        status: 'playing',
        items: puzzles(20) as never,
        phase: 'live',
        phaseEnds: performance.now() + DUEL_RULES.race.timedMs,
        liveSince: performance.now(),
        progress: {
          white: { index: 0, solved: 0, strikes: 0, done: false },
          black: { index: 0, solved: 0, strikes: 0, done: false },
        },
      }),
    );
    renderDuel();
    expect(
      screen.getByText('Three-minute race · 1200 · The most puzzles solved in three minutes'),
    ).toBeVisible();
    tick(700);
    act(() => board.props?.onMove?.('e7', 'e5'));
    tick(400);
    act(() => board.props?.onMove?.('b8', 'c6'));
    expect(session.report).toHaveBeenLastCalledWith({
      index: 0,
      ok: true,
      ms: expect.any(Number) as number,
    });
    expect(screen.getByTestId('race-mine')).toHaveTextContent('1');
    // The next puzzle comes a moment later; a wrong move there is a strike.
    tick(400);
    tick(700);
    act(() => board.props?.onMove?.('d7', 'd5'));
    expect(session.report).toHaveBeenLastCalledWith({
      index: 1,
      ok: false,
      ms: expect.any(Number) as number,
    });
    session.update({
      progress: {
        white: { index: 2, solved: 1, strikes: 1, done: false },
        black: { index: 4, solved: 3, strikes: 0, done: false },
      },
    });
    expect(screen.getByTestId('race-theirs')).toHaveTextContent('3');
    expect(screen.getByRole('img', { name: 'Your strikes: 1 of 3 strikes' })).toBeInTheDocument();
  });

  it('shows how each round went, and the score', () => {
    hold(
      makeView({
        status: 'playing',
        items: puzzles(5) as never,
        round: 0,
        phase: 'reveal',
        score: { white: 1, black: 0 },
        mine: { ok: true, ms: 5000 },
        theirs: { ok: true, ms: 7000 },
        rounds: [
          {
            round: 0,
            results: { white: { ok: true, ms: 5000 }, black: { ok: true, ms: 7000 } },
            winner: 'white',
            points: { white: 1, black: 0 },
          },
        ],
      }),
    );
    renderDuel();
    expect(screen.getByTestId('duel-score-mine')).toHaveTextContent('1');
    expect(screen.getByTestId('duel-score-theirs')).toHaveTextContent('0');
    expect(screen.getByTestId('duel-round-result')).toHaveTextContent('Your round');
    expect(screen.getByTestId('duel-round-result')).toHaveTextContent(
      'You: Solved in 5.00 s. Swift Knight: Solved in 7.00 s.',
    );
    expect(screen.getByTestId('duel-rounds')).toHaveTextContent('Round 1You');
  });

  it('locks in a judgement, and shows the engine’s verdict when the round ends', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      fen: START,
      cp: 150,
      game: 'opera-game',
      ply: i,
    }));
    const session = hold(
      makeView({
        game: 'judge',
        opts: {},
        status: 'playing',
        items: items as never,
        phase: 'live',
        phaseEnds: performance.now() + 30_000,
        liveSince: performance.now(),
      }),
    );
    renderDuel();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Who Stands Better? duel' }),
    ).toBeVisible();
    fireEvent.change(screen.getByTestId('judge-slider'), { target: { value: '1.2' } });
    expect(screen.getByTestId('judge-guess')).toHaveTextContent('White is better (1.2)');
    fireEvent.click(screen.getByTestId('judge-lock'));
    expect(session.report).toHaveBeenCalledWith({ round: 0, guess: 1.2 });
    session.update({ mine: { guess: 1.2 }, theirs: { locked: true } });
    expect(screen.getByTestId('judge-lock')).toBeDisabled();
    expect(screen.getByTestId('judge-round')).toHaveTextContent('Swift Knight has locked in.');
    session.update({
      phase: 'reveal',
      theirs: { guess: -1 },
      rounds: [
        {
          round: 0,
          results: { white: { guess: 1.2 }, black: { guess: -1 } },
          winner: 'white',
          points: { white: 91, black: 0 },
        },
      ],
      score: { white: 91, black: 0 },
    });
    const reveal = screen.getByTestId('judge-reveal');
    expect(reveal).toHaveTextContent('The engine says: White is clearly better (1.5)');
    expect(reveal).toHaveTextContent('You: White is better (1.2) — spot on, 91 points.');
    expect(reveal).toHaveTextContent('Swift Knight: Black is better (1.0) — wrong side, 0 points.');
  });

  it('calls an Arbiter round: too early is a legal move, in time is a catch', () => {
    vi.useFakeTimers();
    const item = {
      fen: START,
      ply: 0,
      lead: ['e2e4', 'e7e5'],
      illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
      game: 'not-a-classic',
    };
    const live = {
      game: 'arbiter' as const,
      opts: { pace: 'normal' as const },
      status: 'playing' as const,
      items: Array.from({ length: 9 }, () => item) as never,
      phase: 'live' as const,
      phaseEnds: performance.now() + 40_000,
      liveSince: performance.now(),
    };
    const first = hold(makeView({ ...live, id: 'ONE' }));
    const { unmount } = renderDuel('/play/duel/ONE');
    const call = screen.getByTestId('duel-call');
    // Nothing on the board yet: no call.
    expect(call).toBeDisabled();
    tick(3000);
    expect(board.props?.fen).not.toBe(START);
    fireEvent.click(call);
    expect(first.report).toHaveBeenCalledWith({
      round: 0,
      call: 'false',
      ms: expect.any(Number) as number,
    });
    unmount();

    const second = hold(makeView({ ...live, id: 'TWO' }));
    renderDuel('/play/duel/TWO');
    // The lead-in, two real moves, then the illegal one, and the time to call it (each step is
    // timed from the one before, as the board shows it).
    for (let step = 0; step < 6; step++) tick(3000);
    expect(screen.getByTestId('duel-call')).toBeDisabled();
    expect(second.report).toHaveBeenCalledWith({ round: 0, call: 'missed', ms: 0 });
  });

  it('catches the illegal move once it is on the board', () => {
    vi.useFakeTimers();
    const item = {
      fen: START,
      ply: 0,
      lead: ['e2e4', 'e7e5'],
      illegal: { from: 'g1', to: 'g3', kind: 'knight-shape' },
      game: 'not-a-classic',
    };
    const session = hold(
      makeView({
        game: 'arbiter',
        opts: { pace: 'normal' },
        status: 'playing',
        items: Array.from({ length: 9 }, () => item) as never,
        phase: 'live',
        phaseEnds: performance.now() + 40_000,
        liveSince: performance.now(),
      }),
    );
    renderDuel();
    for (let step = 0; step < 3; step++) tick(3000);
    // The knight on g3: a move no knight makes.
    expect(board.props?.fen.split(' ')[0]).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/6N1/PPPP1PPP/RNBQKB1R',
    );
    fireEvent.click(screen.getByTestId('duel-call'));
    expect(session.report).toHaveBeenCalledWith({
      round: 0,
      call: 'caught',
      ms: expect.any(Number) as number,
    });
    session.update({
      phase: 'reveal',
      mine: { call: 'caught', ms: 420 },
      rounds: [
        {
          round: 0,
          results: { white: { call: 'caught', ms: 420 }, black: null },
          winner: 'white',
          points: { white: 1, black: 0 },
        },
      ],
    });
    expect(screen.getByTestId('arbiter-explain')).toHaveTextContent('A knight left its L');
  });

  it('ends with the result, and offers a rematch', () => {
    const session = hold(
      makeView({
        status: 'over',
        items: puzzles(5) as never,
        result: '0-1',
        reason: 'score',
        score: { white: 1, black: 2 },
      }),
    );
    renderDuel();
    const dialog = openDialog('You lost')!;
    expect(within(dialog).getByTestId('duel-end-sentence')).toHaveTextContent('1 rounds to 2.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rematch' }));
    expect(session.rematch).toHaveBeenCalledWith('offer');
    session.update({ offers: { rematch: 'white' } });
    expect(
      within(openDialog('You lost')!).getByRole('button', { name: 'Rematch offered' }),
    ).toBeDisabled();
    session.update({ next: { path: '/play/duel/NEXT' }, offers: { rematch: null } });
    expect(playSound).toHaveBeenCalledWith('notify');
    expect(
      within(openDialog('You lost')!).getByRole('button', { name: 'Play the rematch' }),
    ).toBeVisible();
  });

  it('asks before resigning a duel under way', () => {
    const session = hold(
      makeView({
        status: 'playing',
        items: puzzles(5) as never,
        phase: 'reveal',
      }),
    );
    renderDuel();
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));
    const dialog = openDialog('Resign this duel?')!;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resign' }));
    expect(session.resign).toHaveBeenCalledTimes(1);
  });
});
