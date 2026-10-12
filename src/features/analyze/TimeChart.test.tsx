import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import { reviewOf } from '@/test/fakeReview';
import { TimeChart } from './TimeChart';
import { gameTimesOfPgn } from './timeUse';

const PGN = `[TimeControl "300+0"]

1. e4 {[%clk 0:05:00]} e5 {[%clk 0:05:00]} 2. Bc4 {[%clk 0:04:55]} Nc6 {[%clk 0:04:58]}
3. Qh5 {[%clk 0:00:25]} Nf6 {[%clk 0:01:00]} 4. Nc3 {[%clk 0:00:20]} Nxh5 {[%clk 0:00:58]} *`;
const SANS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Nc3', 'Nxh5'];
const REVIEW = reviewOf(SANS, {
  6: { judgement: 'blunder', best: 'd8e7' },
  7: { judgement: 'blunder', best: 'h5f7' },
});

function renderChart(currentPly = 0) {
  const times = gameTimesOfPgn(PGN);
  if (!times) throw new Error('the game has clock times');
  const onSelect = vi.fn();
  render(
    <TimeChart
      times={times}
      review={REVIEW}
      currentPly={currentPly}
      onSelect={onSelect}
      startFen={START_FEN}
      learner="white"
    />,
  );
  return onSelect;
}

describe('TimeChart', () => {
  it('reads the clock use in words and labels the chart for screen readers', () => {
    renderChart();
    const section = screen.getByRole('region', { name: 'Time per move' });
    expect(within(section).getByTestId('time-reading')).toHaveTextContent(
      'Your only mistake came with under 30 seconds left.You spent 4 minutes 30 seconds on move 3, Qh5.',
    );
    const chart = within(section).getByRole('img');
    expect(chart).toHaveAccessibleName(
      /Time spent on each move: White above the line, Black below, up to 5 min/,
    );
    expect(chart).toHaveAccessibleName(
      /Black used 4 min 2 s over 4 moves, the longest 3 min 58 s on move 3/,
    );
    // The review's verdicts and the time trouble are in the key, named.
    const key = within(section).getByRole('list', { name: 'Key' });
    expect(key).toHaveTextContent('Blunder');
    expect(key).toHaveTextContent('Under 30 seconds left');
  });

  it('has every time in a table, each move a button to it', () => {
    const onSelect = renderChart(5);
    // Folded away under "The times move by move" until opened.
    const table = screen.getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(5);
    expect(rows[3]).toHaveTextContent('3');
    expect(rows[3]).toHaveTextContent('Qh5 4 min 30 s, 0:25 left');
    expect(rows[3]).toHaveTextContent('Nf6 3 min 58 s, 1:00 left, blunder');
    expect(rows[4]).toHaveTextContent('Nc3 5 s, 0:20 left, blunder');
    const current = within(table).getByRole('button', { current: true, hidden: true });
    expect(current).toHaveTextContent('Qh5');
    fireEvent.click(within(rows[4]!).getByRole('button', { name: /Nc3/, hidden: true }));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it('shows the move on the board and the one pointed at in the readout', () => {
    renderChart(5);
    expect(screen.getByText(/3\./, { selector: '.timechart__readout strong' })).toHaveTextContent(
      '3. Qh5',
    );
    const svg = screen.getByRole('img');
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 0 });
    expect(document.querySelector('.timechart__readout')).toHaveTextContent('1. e4');
    fireEvent.pointerLeave(svg);
    expect(document.querySelector('.timechart__readout')).toHaveTextContent('3. Qh5');
  });
});
