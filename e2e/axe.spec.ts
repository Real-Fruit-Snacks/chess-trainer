import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/**
 * An automated accessibility sweep (axe-core, WCAG 2.1 A/AA) over every page —
 * the top-level ones and one of each parameterised route — in all three colour
 * schemes. It catches the mechanical slips — missing labels, bad contrast,
 * invalid ARIA — that the hand-written accessibility tests do not look for.
 */
const PAGES = [
  '/',
  '/learn',
  '/learn/how-pieces-move',
  '/learn/course/first-steps',
  '/learn/recall',
  '/placement',
  '/puzzles',
  '/puzzles/themes',
  '/puzzles/daily',
  '/puzzles/rush',
  '/puzzles/blind',
  '/puzzles/openings',
  '/puzzles/review',
  '/puzzles/mine',
  '/puzzles/woodpecker',
  '/drills',
  '/drills/coordinates',
  '/drills/vision',
  '/drills/threats',
  '/drills/endgame/mate-kq',
  '/openings',
  '/openings/italian',
  '/play',
  '/analyze',
  '/games',
  '/studies',
  '/studies/reti-1921',
  '/classics',
  '/classics/opera-game',
  '/patterns',
  '/reference',
  '/progress',
  '/settings',
  '/settings#play',
  '/settings#engine',
  '/settings#data',
  '/settings#app',
  '/settings/lab',
  '/no-such-page',
  '/arcade',
  '/arcade/hand-and-brain',
  '/arcade/daily-opening',
  '/arcade/who-stands-better',
  '/arcade/odds-ladder',
  '/arcade/army-draft',
  '/arcade/fortress',
  '/arcade/engine-says',
  '/arcade/blindfold',
  '/arcade/simul',
  '/arcade/arbiter',
  '/arcade/ghost-knight',
];

type Scheme = 'light' | 'dark' | 'black';

async function seed(page: Page, scheme: Scheme) {
  await page.addInitScript(
    ([progress, settings]) => {
      if (!localStorage.getItem('chess-trainer:progress')) {
        localStorage.setItem('chess-trainer:progress', progress);
      }
      localStorage.setItem('chess-trainer:settings', settings);
    },
    [
      JSON.stringify({ state: { onboarded: true, puzzleRating: 1200 }, version: 6 }),
      JSON.stringify({ state: { colorScheme: scheme }, version: 3 }),
    ] as const,
  );
}

async function audit(page: Page, path: string) {
  await page.goto(path);
  // Code-split pages: wait for the page's own heading, then for the engine or
  // boards to settle so what is audited is what a visitor sees.
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The chessground board draws pieces as CSS backgrounds inside custom
    // elements; its DOM is not something axe can judge.
    .exclude('cg-board')
    // Toasts fade in; a contrast check mid-animation says nothing about the design.
    .exclude('.toasts')
    .analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

for (const scheme of ['light', 'dark', 'black'] as const) {
  test.describe(`axe sweep (${scheme})`, () => {
    for (const path of PAGES) {
      test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
        await seed(page, scheme);
        const violations = await audit(page, path);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }
  });
}
