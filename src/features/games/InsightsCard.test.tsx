import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { StoredGame } from '@/store/games';
import { InsightsCard } from './InsightsCard';
import type { ReviewDigest, TimeSideDigest } from './insights';

vi.mock('@/lib/openings', () => ({
  loadOpenings: () => Promise.resolve({}),
  findOpening: () => null,
  displayOpeningName: (name: string) => name,
}));

const blank = { moves: 0, loss: 0, errors: 0 };
const phases = {
  opening: { white: { moves: 10, loss: 0.2, errors: 0 }, black: blank },
  middlegame: { white: { moves: 20, loss: 1, errors: 2 }, black: blank },
  endgame: { white: blank, black: blank },
};
const clock: TimeSideDigest = {
  phases: {
    opening: { seconds: 40, moves: 10 },
    middlegame: { seconds: 360, moves: 20 },
    endgame: { seconds: 0, moves: 0 },
  },
  trouble: { moves: 10, errors: 3 },
  calm: { moves: 30, errors: 1 },
  short: true,
};

function game(id: string, digest: ReviewDigest): StoredGame {
  return {
    id,
    pgn: '1. e4 e5 *',
    white: 'alice',
    black: 'bob',
    result: '1-0',
    date: '2026.09.01',
    event: '',
    url: null,
    plies: 2,
    speed: 'blitz',
    rated: null,
    timestamp: null,
    source: 'lichess',
    importedAt: 1,
    review: {
      accuracy: { white: 80, black: 70 },
      counts: {
        white: { inaccuracy: 0, mistake: 1, blunder: 1 },
        black: { inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      depth: 12,
      at: 1,
      digest,
    },
  };
}

function renderCard(list: StoredGame[]) {
  render(
    <MemoryRouter>
      <InsightsCard list={list} player="alice" />
    </MemoryRouter>,
  );
  return screen.getByTestId('insights-time');
}

describe('InsightsCard: time', () => {
  it('shows how the learner uses the clock in games with clock times', () => {
    const time = renderCard([
      game('t1', {
        phases,
        motifs: { white: {}, black: {} },
        time: { trouble: 30, white: clock, black: clock },
      }),
    ]);
    expect(time).toHaveTextContent('Short of time in 1 of 1 reviewed game with clock times.');
    const rows = within(time).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('opening · 10 moves4 s10%');
    expect(rows[2]).toHaveTextContent('middlegame · 20 moves18 s90%');
    expect(rows[3]).toHaveTextContent('endgame · 0 moves——');
    expect(within(time).getByTestId('insights-time-trouble')).toHaveTextContent(
      'Mistakes and blunders per 10 moves: 3.0 when short of time (10 moves), 0.3 otherwise.',
    );
    expect(
      within(time).getByRole('link', { name: 'Lesson: Practical play and the clock' }),
    ).toHaveAttribute('href', '/learn/practical-play-and-time');
    // One game is too few to go by: the section says so.
    expect(time).toHaveClass('insights__thin');
  });

  it('explains where the time findings come from before there are any', () => {
    const time = renderCard([game('t2', { phases, motifs: { white: {}, black: {} } })]);
    expect(time).toHaveTextContent(
      'Reviewed games with clock times show here how you use your clock',
    );
  });
});
