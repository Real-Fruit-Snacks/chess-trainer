import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SoundModule from '@/lib/sound';
import { useProgress } from '@/store/progress';
import { DUEL_RULES } from '../../../relay/src/live/shared.mjs';
import type { RacePuzzle, RaceRoomRace, RaceRoomView } from './types';

vi.mock('@/lib/sound', async (importOriginal) => {
  const actual = await importOriginal<typeof SoundModule>();
  return { ...actual, playSound: vi.fn(), playMoveSound: vi.fn() };
});

vi.mock('@/components/board/Board', () => ({
  Board: (props: { ariaLabel?: string }) => (
    <div role="application" aria-label={props.ariaLabel} tabIndex={0} />
  ),
}));

const rooms = vi.hoisted(() => ({ byId: new Map<string, unknown>() }));
vi.mock('./roomSessions', () => ({
  getRaceRoom: (id: string) => (id === 'not-a-room' ? null : (rooms.byId.get(id) ?? null)),
}));

import { playSound } from '@/lib/sound';
import { useLivePrefs } from './prefs';
import RaceRoomPage from './RaceRoomPage';

const ROOM = 'R'.repeat(22);
const ME = 'aaaaaaaa';
const B = 'bbbbbbbb';
const C = 'cccccccc';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const puzzles = (count: number): RacePuzzle[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `pz${String(i).padStart(3, '0')}`,
    fen: START,
    moves: 'e2e4 e7e5 g1f3 b8c6',
    rating: 1500,
  }));

const MEMBERS = [
  { id: ME, name: 'Patient Bishop', rating: 1500, here: true },
  { id: B, name: 'Swift Knight', rating: null, here: true },
  { id: C, name: 'Quiet Rook', rating: 1320, here: false },
];

function makeView(patch: Partial<RaceRoomView> = {}): RaceRoomView {
  return {
    id: ROOM,
    kind: 'race',
    connection: 'open',
    missing: false,
    you: ME,
    host: ME,
    members: MEMBERS,
    max: 8,
    chat: [],
    state: { opts: { format: 'rounds', level: 1500 }, count: 0, race: null },
    joining: false,
    error: null,
    dealing: false,
    ...patch,
  };
}

function makeRace(patch: Partial<RaceRoomRace> = {}): RaceRoomRace {
  return {
    number: 1,
    format: 'rounds',
    level: 1500,
    status: 'playing',
    racers: MEMBERS.slice(0, 2).map(({ id, name, rating }) => ({ id, name, rating })),
    items: puzzles(5),
    round: 0,
    phase: 'live',
    phaseEnds: performance.now() + 60_000,
    liveSince: performance.now(),
    results: {},
    rounds: [],
    scores: { [ME]: 0, [B]: 0 },
    progress: null,
    places: null,
    ...patch,
  };
}

function makeSession(initial: RaceRoomView) {
  let view = initial;
  const listeners = new Set<() => void>();
  return {
    getView: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    update(patch: Partial<RaceRoomView>) {
      view = { ...view, ...patch };
      act(() => {
        for (const listener of listeners) listener();
      });
    },
    join: vi.fn(),
    leave: vi.fn(),
    say: vi.fn(),
    setOptions: vi.fn(),
    start: vi.fn(),
    report: vi.fn(),
    close: vi.fn(),
  };
}

function hold(view: RaceRoomView) {
  const session = makeSession(view);
  rooms.byId.set(view.id, session);
  return session;
}

function renderRoom(id = ROOM) {
  return render(
    <MemoryRouter initialEntries={[`/play/race/${id}`]}>
      <Routes>
        <Route path="/play" element={<p>Play</p>} />
        <Route path="/play/race/:roomId" element={<RaceRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rooms.byId.clear();
  vi.mocked(playSound).mockClear();
  useProgress.setState({ puzzleRating: 1480 });
  useLivePrefs.getState().update({ name: 'Swift Knight', showRating: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RaceRoomPage', () => {
  it('says so for a link that is not a room, or a room that has gone', () => {
    renderRoom('not-a-room');
    expect(screen.getByRole('heading', { name: 'No such room' })).toBeTruthy();
    hold(makeView({ missing: true }));
    renderRoom();
    expect(screen.getByRole('heading', { name: 'Room not found' })).toBeTruthy();
  });

  it('shows a visitor who is in the room, and lets them join under their name', () => {
    const session = hold(makeView({ you: null, host: B }));
    renderRoom();
    const players = screen.getByRole('region', { name: 'Players' });
    const items = within(players).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Patient Bishop 1500Here',
      'Swift KnightHostHere',
      'Quiet Rook 1320Away',
    ]);
    expect(players.textContent).toContain('Join under your name, Swift Knight (1480).');
    fireEvent.click(screen.getByRole('button', { name: 'Join the room' }));
    expect(session.join).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Leave the room' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Messages' })).toBeNull();

    // A full room takes nobody more.
    session.update({
      members: Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}xxxxxx`,
        name: 'Calm Castle',
        rating: null,
        here: true,
      })),
    });
    expect(screen.getByText('This room is full.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Join the room' }).disabled).toBe(
      true,
    );
  });

  it('lets the host choose the race and start it with the players here', () => {
    const session = hold(makeView({ members: [MEMBERS[0]!] }));
    renderRoom();
    expect(screen.getByTestId('race-room-options').textContent).toBe(
      'Five rounds · 1500 · The most points after 5 puzzles',
    );
    const start = screen.getByTestId<HTMLButtonElement>('race-room-start');
    expect(start.textContent).toBe('Start with 1 player');
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/A race takes at least two players here/)).toBeTruthy();
    expect(screen.getByTestId('race-room-link').textContent).toBe(
      `${window.location.origin}/play/race/${ROOM}`,
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();

    session.update({ members: MEMBERS });
    expect(start.textContent).toBe('Start with 2 players');
    fireEvent.click(start);
    expect(session.start).toHaveBeenCalledTimes(1);
    session.update({ dealing: true });
    expect(start.textContent).toBe('Dealing the puzzles…');
    expect(start.disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Three-minute race' }));
    expect(session.setOptions).toHaveBeenCalledWith({ format: 'timed', level: 1500 });
    fireEvent.change(screen.getByLabelText('Puzzle rating'), { target: { value: '1800' } });
    expect(session.setOptions).toHaveBeenLastCalledWith({ format: 'rounds', level: 1800 });

    fireEvent.click(screen.getByRole('button', { name: 'Leave the room' }));
    expect(session.leave).toHaveBeenCalledTimes(1);
  });

  it('shows the others whose room it is, and the options read-only', () => {
    hold(makeView({ host: B }));
    renderRoom();
    expect(screen.getByText('Waiting for Swift Knight to start the race.')).toBeTruthy();
    expect(screen.queryByTestId('race-room-start')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Three-minute race' })).toBeNull();
    expect(screen.getByText('Five rounds · 1500', { selector: 'p' })).toBeTruthy();
  });

  it('puts a racer at the board, beside the standings, and reports their result', () => {
    const counting = makeRace({ phase: 'countdown', phaseEnds: performance.now() + 3000 });
    const session = hold(makeView({ state: { opts: counting, count: 1, race: counting } }));
    renderRoom();
    expect(screen.getByTestId('duel-countdown').textContent).toContain('Round 1 of 5');
    expect(screen.getByTestId('race-room-status').textContent).toBe(
      'Round 1 of 5 is about to start.',
    );
    expect(playSound).not.toHaveBeenCalled();

    const live = makeRace({ results: { [B]: { ok: true, ms: 7950 } } });
    session.update({ state: { opts: live, count: 1, race: live } });
    expect(screen.getByRole('application', { name: /Race puzzle/ })).toBeTruthy();
    const standings = screen.getByTestId('race-standings');
    expect(
      within(standings)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      // Nobody has scored yet: no places, rather than everyone first.
      '–Patient Bishop (you)Solving0 points',
      '–Swift KnightSolved in 7.95 s0 points',
    ]);
    expect(screen.getByTestId('race-status').textContent).toContain('Swift Knight solved it.');

    // The round's result: who scored what.
    const reveal = makeRace({
      phase: 'reveal',
      phaseEnds: performance.now() + DUEL_RULES.revealMs,
      rounds: [
        {
          round: 0,
          results: { [ME]: { ok: true, ms: 9000 }, [B]: { ok: true, ms: 7950 } },
          points: { [ME]: 4, [B]: 5 },
        },
      ],
      scores: { [ME]: 4, [B]: 5 },
    });
    session.update({ state: { opts: reveal, count: 1, race: reveal } });
    expect(
      within(standings)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      '1stSwift KnightSolved in 7.95 s · +55 points',
      '2ndPatient Bishop (you)Solved in 9.00 s · +44 points',
    ]);
    expect(screen.getByTestId('race-room-round-result').textContent).toContain(
      'You scored 4 points',
    );
  });

  it('shows the timed race’s standings: solved, then the fewer wrong answers', async () => {
    const race = makeRace({
      format: 'timed',
      items: puzzles(20),
      progress: {
        [ME]: { index: 4, solved: 3, strikes: 1, done: false },
        [B]: { index: 4, solved: 3, strikes: 0, done: false },
      },
    });
    hold(makeView({ state: { opts: race, count: 1, race } }));
    renderRoom();
    // The puzzle the room counts this player on comes out a moment after the board.
    expect(await screen.findByRole('application', { name: /Race puzzle 5/ })).toBeTruthy();
    const lines = within(screen.getByTestId('race-standings')).getAllByRole('listitem');
    expect(lines.map((li) => li.textContent)).toEqual([
      '1stSwift Knight Puzzle 53 solved',
      '2ndPatient Bishop (you) Puzzle 53 solved',
    ]);
    expect(within(lines[1]!).getByRole('img').getAttribute('aria-label')).toBe(
      'Patient Bishop’s strikes: 1 of 3 strikes',
    );
  });

  it('lets a late joiner watch, and shows everyone the places; the host races again', () => {
    const race = makeRace({ racers: [{ id: B, name: 'Swift Knight', rating: null }] });
    const session = hold(
      makeView({ host: B, state: { opts: { format: 'rounds', level: 1500 }, count: 1, race } }),
    );
    renderRoom();
    expect(screen.queryByRole('application')).toBeNull();
    expect(screen.getByTestId('race-room-watch').textContent).toContain(
      'You race in the next one.',
    );
    expect(screen.getByText('A race is on: you race in the next one.')).toBeTruthy();

    const over = makeRace({
      status: 'over',
      phase: null,
      phaseEnds: null,
      scores: { [ME]: 9, [B]: 14 },
      places: [
        { id: B, place: 1 },
        { id: ME, place: 2 },
      ],
    });
    session.update({
      host: ME,
      state: { opts: { format: 'rounds', level: 1500 }, count: 1, race: over },
    });
    expect(playSound).toHaveBeenCalledWith('gameEnd');
    const places = screen.getByTestId('race-room-places');
    expect(
      within(places)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1stSwift Knight14 points', '2ndPatient Bishop (you)9 points']);
    expect(screen.getByTestId('race-room-verdict').textContent).toBe('You came 2nd with 9 points.');
    expect(screen.getByTestId('race-room-start').textContent).toBe('Race again');
  });
});
