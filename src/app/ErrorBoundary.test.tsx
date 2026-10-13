import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia = () =>
    ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
});

import { isChunkLoadError, normaliseError } from './crash';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('Test lab: deliberate crash');
  return <p>All fine</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
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
    // Feedback is inline: no toast container is mounted once the shell has crashed.
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Crash details copied.');
  });

  it('survives a non-Error throwable and tells a stale chunk apart from a crash', () => {
    expect(normaliseError('plain string').message).toBe('plain string');
    expect(normaliseError({ message: 'object with message' }).message).toBe('object with message');
    expect(normaliseError({ code: 7 }).message).toBe('Non-error thrown: {"code":7}');
    expect(normaliseError(undefined).message).toMatch(/Non-error thrown/);
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /x.js')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('Test lab: deliberate crash'))).toBe(false);
  });

  it('renders a page crash inside the shell, with the reload wording for a stale chunk', () => {
    function Stale(): never {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/Play-abc.js');
    }
    render(
      <MemoryRouter initialEntries={['/play']}>
        <ErrorBoundary inline resetKey="/play">
          <Stale />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    const page = screen.getByTestId('crash-page');
    expect(page).toHaveClass('crash--inline');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A new version is ready');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy details' })).not.toBeInTheDocument();
  });
});
