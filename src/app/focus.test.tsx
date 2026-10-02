import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFocus } from './focus';

function Chrome() {
  const focus = useFocus((s) => s.active);
  return (
    <div className={focus ? 'shell shell--focus' : 'shell'} data-testid="shell">
      <header>Header</header>
    </div>
  );
}

describe('focus mode store', () => {
  it('starts off and toggles the shell class', () => {
    render(<Chrome />);
    expect(screen.getByTestId('shell')).not.toHaveClass('shell--focus');
    act(() => useFocus.getState().set(true));
    expect(screen.getByTestId('shell')).toHaveClass('shell--focus');
    act(() => useFocus.getState().set(false));
    expect(screen.getByTestId('shell')).not.toHaveClass('shell--focus');
  });
});
