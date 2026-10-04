/**
 * Every keyboard shortcut the app understands, grouped by the page it works on.
 * Shown in the "Keyboard shortcuts" dialog (press ? anywhere). Keep this in
 * step with the `keydown` handlers in the feature pages: a key listed here must
 * do what it says on that page, and only the pages listed handle it.
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
    title: 'Single-key shortcuts',
    shortcuts: [
      {
        keys: ['Settings'],
        action:
          'Letter keys (H, S, N, F and ?) can be turned off in Settings → Play; Enter, Space and the arrows keep working',
      },
    ],
  },
  {
    title: 'Analyze',
    shortcuts: [
      { keys: ['←', '→'], action: 'Previous / next move' },
      { keys: ['Home', 'End'], action: 'Start / end of the game' },
      { keys: ['F'], action: 'Flip the board' },
    ],
  },
  {
    title: 'Puzzles',
    shortcuts: [
      { keys: ['H'], action: 'Hint' },
      { keys: ['S'], action: 'Show the solution' },
      { keys: ['N'], action: 'Next puzzle (after a solve or a miss)' },
      {
        keys: ['Enter'],
        action: 'Start a Puzzle Rush run (three minutes; after a run, the same mode again)',
      },
    ],
  },
  {
    title: 'Lessons',
    shortcuts: [
      { keys: ['→'], action: 'Continue to the next step (once its task is done)' },
      { keys: ['←'], action: 'Back one step' },
      { keys: ['H'], action: 'Hint for the current task' },
    ],
  },
  {
    title: 'Lesson recall',
    shortcuts: [
      { keys: ['H'], action: 'Hint' },
      { keys: ['N', '→'], action: 'Next position (after it is graded)' },
    ],
  },
  {
    title: 'Endgame studies',
    shortcuts: [
      { keys: ['H'], action: 'Hint' },
      { keys: ['S'], action: 'Show the solution' },
    ],
  },
  {
    title: 'Mating patterns',
    shortcuts: [{ keys: ['Enter'], action: 'Next pattern (after a solve or a miss)' }],
  },
  {
    title: 'Openings',
    shortcuts: [
      { keys: ['Space'], action: 'Show the repertoire move' },
      { keys: ['N'], action: 'Next line (once the current one is done)' },
    ],
  },
  {
    title: 'Classic games',
    shortcuts: [{ keys: ['Space', 'Enter', '→'], action: 'Next move (after a guess)' }],
  },
  {
    title: 'Arcade',
    shortcuts: [
      { keys: ['Enter'], action: 'Daily Opening: submit the first matching opening name' },
      { keys: ['N'], action: 'Simul: next board waiting for your move' },
      { keys: ['Space'], action: 'Arbiter: call the move on the board illegal' },
      { keys: ['Enter'], action: 'Arbiter and Ghost Knight: go on once a round or hunt is over' },
    ],
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
