import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReferencePage from './ReferencePage';

function renderAt(url = '/reference') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ReferencePage />
    </MemoryRouter>,
  );
}

const media = (reduce: boolean) => (query: string) =>
  ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList;

describe('ReferencePage', () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = original;
  });

  it('renders glossary definitions as text, not markup', () => {
    renderAt();
    const glossary = screen.getByTestId('glossary');
    const opposition = within(glossary).getByText('Opposition').parentElement!;
    expect(opposition.textContent).not.toContain('*');
    expect(within(opposition).getByText('not').tagName).toBe('EM');
    expect(glossary.textContent).not.toMatch(/\*\w/);
  });

  it('links glossary terms to the step that teaches them', () => {
    renderAt();
    const glossary = screen.getByTestId('glossary');
    const zugzwang = within(glossary).getByText('Zugzwang').parentElement!;
    expect(within(zugzwang).getByRole('link', { name: /Lesson:/ })).toHaveAttribute(
      'href',
      '/learn/fortresses-and-zugzwang?step=1',
    );
    const woodpecker = within(glossary).getByText('Woodpecker method').parentElement!;
    expect(within(woodpecker).getByRole('link', { name: 'Woodpecker sets' })).toHaveAttribute(
      'href',
      '/puzzles/woodpecker',
    );
  });

  it('jumps to a section without smooth scrolling when motion is reduced', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.stubGlobal('matchMedia', media(true));
    renderAt('/reference#faq');
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('scrolls smoothly when motion is fine', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.stubGlobal('matchMedia', media(false));
    renderAt('/reference#glossary');
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth' });
  });
});
