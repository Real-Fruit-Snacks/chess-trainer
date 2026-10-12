import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_SYMBOL_PREFIX } from '../../../scripts/lib/iconSprite';
import { Icon } from './Icon';

describe('Icon', () => {
  it('draws its symbol from the page sprite', () => {
    const { container } = render(<Icon name="play" />);
    const use = container.querySelector('svg.icon.icon--play use');
    expect(use?.getAttribute('href')).toBe(`#${ICON_SYMBOL_PREFIX}play`);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is named when it has a title', () => {
    const { getByRole } = render(<Icon name="check" title="Done" />);
    expect(getByRole('img', { name: 'Done' })).toHaveClass('icon--check');
  });
});
