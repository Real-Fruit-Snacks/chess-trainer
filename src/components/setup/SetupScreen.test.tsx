import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Spinner } from '@/components/ui';
import { SetupScreen } from './SetupScreen';

describe('SetupScreen', () => {
  it('says what is still getting ready beside Start, which stays usable', () => {
    const onStart = vi.fn();
    render(
      <SetupScreen onStart={onStart} status={<Spinner label="Loading engine" />} startTestId="go">
        <p>Choices</p>
      </SetupScreen>,
    );
    const start = screen.getByTestId('go');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading engine');
    // In the bar with Start, before it.
    expect(status.closest('.setup__actions')).toBe(start.closest('.setup__actions'));
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('has no status line when nothing is loading', () => {
    render(<SetupScreen onStart={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.setup__status')).toBeNull();
  });
});
