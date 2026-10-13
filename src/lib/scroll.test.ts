import { describe, expect, it, vi } from 'vitest';
import { bringIntoView, scrollIntoContainer } from './scroll';

/** A container 200px tall at y=100 that has already scrolled 50px, with an item at a given y. */
function setup(itemTop: number, itemHeight = 20) {
  const container = document.createElement('div');
  const item = document.createElement('button');
  container.append(item);
  document.body.append(container);
  container.scrollTop = 50;
  Object.defineProperty(container, 'clientHeight', { value: 200 });
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 300,
    height: 200,
  } as DOMRect);
  vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
    top: itemTop,
    bottom: itemTop + itemHeight,
    height: itemHeight,
  } as DOMRect);
  const page = vi.spyOn(window, 'scrollTo');
  return { container, item, page };
}

describe('scrollIntoContainer', () => {
  it('leaves everything alone when the item is already visible', () => {
    const { container, item, page } = setup(150);
    scrollIntoContainer(container, item);
    expect(container.scrollTop).toBe(50);
    expect(page).not.toHaveBeenCalled();
  });

  it('scrolls the container down just enough to show an item below its bottom edge', () => {
    const { container, item } = setup(340);
    scrollIntoContainer(container, item);
    expect(container.scrollTop).toBe(50 + (360 - 300));
  });

  it('scrolls the container up just enough to show an item above its top edge', () => {
    const { container, item } = setup(60);
    scrollIntoContainer(container, item);
    expect(container.scrollTop).toBe(50 - 40);
  });

  it('never scrolls the page itself', () => {
    const { container, item, page } = setup(900);
    const before = window.scrollY;
    scrollIntoContainer(container, item);
    expect(window.scrollY).toBe(before);
    expect(page).not.toHaveBeenCalled();
  });
});

describe('bringIntoView', () => {
  /** A title at `top` (20px tall) in a card, in a window 700px tall with nothing sticky. */
  function place(top: number) {
    const card = document.createElement('section');
    const title = document.createElement('h2');
    card.append(title);
    document.body.append(card);
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 20,
      height: 20,
    } as DOMRect);
    const scrolled = vi.fn();
    card.scrollIntoView = scrolled;
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
    return { card, title, scrolled };
  }

  it('leaves a title in sight alone', () => {
    const { card, title, scrolled } = place(200);
    bringIntoView(title, card);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it('brings the card to the top when the title is above the screen', () => {
    const { card, title, scrolled } = place(-300);
    bringIntoView(title, card);
    expect(scrolled).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  });

  it('brings the card to the top when the title is below the screen', () => {
    const { card, title, scrolled } = place(900);
    bringIntoView(title, card);
    expect(scrolled).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  });
});
