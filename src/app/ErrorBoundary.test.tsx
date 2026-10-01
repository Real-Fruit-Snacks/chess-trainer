import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '@/components/ui/toastStore';

vi.hoisted(() => {
  window.matchMedia = () =>
    ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
});

import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('Test lab: deliberate crash');
  return <p>All fine</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('renders its children while nothing is wrong', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb explode={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('All fine')).toBeInTheDocument();
  });

  it('shows the crash page with the details a report needs', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <MemoryRouter initialEntries={['/play']}>
        <ErrorBoundary>
          <Bomb explode />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    const page = screen.getByTestId('crash-page');
    expect(page).toHaveTextContent('Something went wrong');
    expect(page).toHaveTextContent('Error: Test lab: deliberate crash');
    expect(page).toHaveTextContent(__APP_VERSION__);
    const report = screen.getByRole('link', { name: 'Report a bug' });
    expect(report.getAttribute('href')).toContain('template=bug_report.yml');
    expect(report.getAttribute('href')).toContain('Crash%3A+Test+lab');
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('Test lab: deliberate crash');
    await vi.waitFor(() =>
      expect(useToasts.getState().toasts[0]?.message).toBe('Crash details copied.'),
    );
  });
});
