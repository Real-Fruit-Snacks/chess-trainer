/**
 * Every keyboard shortcut the app understands, grouped by where it works.
 * Shown in the "Keyboard shortcuts" dialog (press ? anywhere). Keep this in
 * step with the `keydown` handlers in the feature pages.
 */
export interface Shortcut {
  keys: string[];
  action: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Everywhere',
    shortcuts: [
      { keys: ['?'], action: 'Show this list' },
      { keys: ['Esc'], action: 'Close dialogs and menus' },
      { keys: ['Tab'], action: 'Move between controls; the first Tab reveals “Skip to content”' },
    ],
  },
  {
    title: 'Boards with a move list (Analyze, Play, Classic games)',
    shortcuts: [
      { keys: ['←', '→'], action: 'Previous / next move' },
      { keys: ['Home', 'End'], action: 'Start / end of the game' },
      { keys: ['F'], action: 'Flip the analysis board' },
    ],
  },
  {
    title: 'Puzzles',
    shortcuts: [
      { keys: ['H'], action: 'Hint' },
      { keys: ['S'], action: 'Show the solution' },
      { keys: ['N'], action: 'Next puzzle (after a solve or a miss)' },
      { keys: ['Enter'], action: 'Start Puzzle Rush' },
    ],
  },
  {
    title: 'Lessons',
    shortcuts: [
      { keys: ['→'], action: 'Continue to the next step' },
      { keys: ['←'], action: 'Back one step' },
      { keys: ['H'], action: 'Hint for the current task' },
    ],
  },
  {
    title: 'Openings and classic games',
    shortcuts: [
      { keys: ['Space'], action: 'Show the repertoire move' },
      { keys: ['N'], action: 'Next repertoire line' },
      { keys: ['Space', 'Enter', '→'], action: 'Next move in a classic game' },
    ],
  },
  {
    title: 'Simul',
    shortcuts: [{ keys: ['N'], action: 'Next board waiting for your move' }],
  },
  {
    title: 'Moving pieces',
    shortcuts: [
      { keys: ['Click', 'Click'], action: 'Select a piece, then its destination' },
      { keys: ['Tab'], action: 'Focus the board; the arrow keys then move a square cursor' },
      { keys: ['Enter'], action: 'Select the piece under the cursor, then its destination' },
      { keys: ['Esc'], action: 'Clear the selection' },
      { keys: ['e', '4'], action: 'Type a square name to jump the cursor to it' },
      {
        keys: ['Type'],
        action: 'Enable “Keyboard move entry” in Settings to type moves such as Nf3',
      },
    ],
  },
];

/** Keys that open the shortcuts dialog. */
export function isHelpShortcut(event: KeyboardEvent): boolean {
  if (event.key !== '?' && !(event.key === '/' && event.shiftKey)) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  ) {
    return false;
  }
  return true;
}
