import { fireEvent, render, screen, within } from '@testing-library/react';
import { Chess } from 'chess.js';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { type StoredGame, useGames } from '@/store/games';
import { InYourGamesCard } from './InYourGamesCard';

function fenAfter(...sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
}

function stored(
  id: string,
  pgn: string,
  white: string,
  black: string,
  result: string,
  day: number,
): StoredGame {
  return {
    id,
    pgn,
    white,
    black,
    result,
    date: `2026.09.${String(day).padStart(2, '0')}`,
    event: '',
    url: null,
    plies: 0,
    speed: null,
    rated: null,
    timestamp: Date.UTC(2026, 8, day),
    source: 'pgn',
    importedAt: 1,
    review: null,
  };
}

function seed(games: StoredGame[], player = 'alice') {
  useGames.setState({ games: Object.fromEntries(games.map((g) => [g.id, g])), player });
}

function renderCard(fen: string) {
  const onOpen = vi.fn();
  render(
    <MemoryRouter>
      <InYourGamesCard fen={fen} onOpen={onOpen} />
    </MemoryRouter>,
  );
  return onOpen;
}

afterEach(() => {
  useGames.setState({ games: {}, player: '' });
});

const RUY = stored('ruy', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0', 'alice', 'bob', '1-0', 3);
const ITALIAN = stored('italian', '1. Nf3 Nc6 2. e4 e5 3. Bc4 Bc5 0-1', 'carol', 'alice', '0-1', 5);
const QUEENS = stored('queens', '1. d4 d5 2. c4 1/2-1/2', 'alice', 'dave', '1/2-1/2', 1);

describe('InYourGamesCard', () => {
  it('points to My games while there are none', () => {
    renderCard(START_FEN);
    expect(screen.getByRole('link', { name: 'My games' })).toHaveAttribute('href', '/games');
  });

  it('lists the games that reached the position, what came next, and opens one there', async () => {
    seed([RUY, ITALIAN, QUEENS]);
    const onOpen = renderCard(fenAfter('e4', 'e5', 'Nf3', 'Nc6'));
    expect(await screen.findByTestId('in-your-games-count')).toHaveTextContent(
      '2 of your games reached this position.',
    );
    const tally = screen.getByRole('list', { name: 'Played next' });
    expect(
      within(tally)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Bc4 × 1 game', 'Bb5 × 1 game']);
    const rows = screen.getAllByTestId('in-your-games-game');
    // Newest first: the Italian was played after the Ruy Lopez.
    expect(rows[0]).toHaveTextContent('vs carol');
    expect(rows[0]).toHaveTextContent('Win');
    expect(rows[0]).toHaveTextContent('you had black');
    expect(rows[0]).toHaveTextContent('then 3. Bc4');
    expect(rows[1]).toHaveTextContent('vs bob');
    fireEvent.click(rows[1]!);
    expect(onOpen).toHaveBeenCalledWith(RUY, 4);
  });

  it('says when none of the games got there', async () => {
    seed([RUY, ITALIAN, QUEENS]);
    renderCard(fenAfter('h4'));
    expect(await screen.findByTestId('in-your-games-none')).toHaveTextContent(
      'None of your 3 games reached this position.',
    );
  });

  it('shows the first few, and all on request; both players when the side is unknown', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      stored(`m${i}`, `1. e4 e5 2. ${i % 2 ? 'Nf3' : 'Nc3'} *`, 'x', 'y', '*', i + 1),
    );
    seed(many, '');
    renderCard(START_FEN);
    expect(await screen.findAllByTestId('in-your-games-game')).toHaveLength(5);
    expect(screen.getAllByTestId('in-your-games-game')[0]).toHaveTextContent('x – y');
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }));
    expect(screen.getAllByTestId('in-your-games-game')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByTestId('in-your-games-game')).toHaveLength(5);
  });
});
