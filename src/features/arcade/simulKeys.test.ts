import { afterEach, describe, expect, it } from 'vitest';
import { isNextBoardKey } from './simulKeys';

function press(key: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('the Simul’s N key', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves on with N in either case, from the page or the board', () => {
    expect(isNextBoardKey(press('n'), false)).toBe(true);
    expect(isNextBoardKey(press('N', { shiftKey: true }), false)).toBe(true);
    const board = document.createElement('div');
    board.setAttribute('role', 'application');
    expect(isNextBoardKey(press('n', {}, board), false)).toBe(true);
    expect(isNextBoardKey(press('m'), false)).toBe(false);
  });

  it('is ignored while a promotion waits for its piece (N is the knight there)', () => {
    expect(isNextBoardKey(press('n'), true)).toBe(false);
  });

  it('is ignored with modifiers, in fields and under a dialog', () => {
    expect(isNextBoardKey(press('n', { ctrlKey: true }), false)).toBe(false);
    expect(isNextBoardKey(press('n', { metaKey: true }), false)).toBe(false);
    expect(isNextBoardKey(press('n', { altKey: true }), false)).toBe(false);
    expect(isNextBoardKey(press('n', {}, document.createElement('input')), false)).toBe(false);
    expect(isNextBoardKey(press('n', {}, document.createElement('select')), false)).toBe(false);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    expect(isNextBoardKey(press('n'), false)).toBe(false);
    dialog.remove();
    const picker = document.createElement('div');
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-modal', 'true');
    document.body.append(picker);
    expect(isNextBoardKey(press('n'), false)).toBe(false);
  });
});
