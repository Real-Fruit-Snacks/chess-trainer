import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * 0.30, a polish pass on phones and desktops alike: every arcade game is set up on the same
 * screen as Play's new game; the long lists (lessons, classic games, puzzle themes and openings,
 * the endgame drills, the glossary) are searchable, with what was searched kept in the address;
 * a repertoire's start menu sits beside its board rather than over it; Settings' tabs come in
 * even rows on a phone; Placement and Recall start on the page's left edge like every page; and
 * a key chip shows only while its key works.
 */

const PROGRESS_KEY = 'open-file:progress';

/** A returning learner (onboarded, the tour dismissed). */
async function seed(page: Page) {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [
      PROGRESS_KEY,
      JSON.stringify({
        state: { onboarded: true, puzzleRating: 1500, tourDismissed: true },
        version: 8,
      }),
    ] as const,
  );
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 600;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** The page has no sideways scroll. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const ARCADE_GAMES = [
  'hand-and-brain',
  'odds-ladder',
  'fortress',
  'blindfold',
  'engine-says',
  'arbiter',
  'ghost-knight',
  'who-stands-better',
];

test.describe('arcade setup screens', () => {
  test.beforeEach(async ({ page }) => seed(page));

  for (const game of ARCADE_GAMES) {
    test(`${game} is set up on the shared screen, its Start in reach`, async ({ page }) => {
      await page.goto(`/arcade/${game}`);
      const setup = page.locator('section.setup');
      await expect(setup).toBeVisible();
      await expect(setup.locator('.setup__title')).toBeVisible();
      const start = setup.locator('.setup__actions .btn--primary');
      await expect(start).toBeVisible();
      // No game yet: nothing to resign, copy or analyse.
      await expect(page.getByRole('button', { name: /^Resign/ })).toHaveCount(0);
      if (isPhone(page)) {
        // On a phone the form has the screen to itself, and Start stays in view above the bar.
        await expect(page.locator('.trainer--setup .trainer__board')).toBeHidden();
        const startBox = await box(start);
        const viewport = page.viewportSize();
        if (!viewport) throw new Error('no viewport');
        expect(startBox.y + startBox.height).toBeLessThanOrEqual(viewport.height);
      } else {
        await expect(page.locator('.trainer__board').first()).toBeVisible();
      }
      await expectNoSidewaysScroll(page);
    });
  }

  test('the setup screen passes an accessibility check', async ({ page }) => {
    await page.goto('/arcade/hand-and-brain');
    await expect(page.locator('section.setup')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('section.setup').analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('long lists', () => {
  test.beforeEach(async ({ page }) => seed(page));

  test('lessons are found by any words, in any order, and the count says how many show', async ({
    page,
  }) => {
    await page.goto('/learn');
    const search = page.getByRole('searchbox', { name: 'Find a lesson' });
    await search.fill('mates basic');
    await expect(page).toHaveURL(/[?&]q=mates/);
    await expect(page.locator('.list-search__count')).toContainText(/\d+ of \d+ lessons/);
    await search.fill('zzzz no such lesson');
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('.list-search__count')).toHaveText(/^\d+ lessons/);
  });

  test('the endgame drills keep their search and group in the address, so Back returns to them', async ({
    page,
  }) => {
    await page.goto('/drills');
    const search = page.getByRole('searchbox', { name: 'Find an endgame' });
    await search.fill('rook');
    await expect(page).toHaveURL(/[?&]q=rook/);
    const count = page.locator('.list-search__count');
    await expect(count).toContainText(/\d+ of \d+ endgames/);
    const shown = await count.textContent();
    await page.reload();
    await expect(search).toHaveValue('rook');
    await expect(count).toHaveText(shown ?? '');
    await search.fill('zzzz');
    await expect(page.getByText(/No endgame matches “zzzz”/)).toBeVisible();
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
  });

  test('a glossary search with no match offers the whole glossary back', async ({ page }) => {
    await page.goto('/reference');
    const search = page.getByRole('searchbox', { name: 'Search the glossary' });
    await search.fill('zzzz');
    await expect(page.getByText('No term matches “zzzz”.')).toBeVisible();
    await page.getByRole('button', { name: 'Show everything' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByTestId('glossary')).toBeVisible();
  });
});

test.describe('smaller fixes', () => {
  test.beforeEach(async ({ page }) => seed(page));

  test('a repertoire’s start menu sits beside its board, never over it', async ({ page }) => {
    await page.goto('/openings/italian');
    const menu = page.getByTestId('repertoire-menu');
    await expect(menu).toBeVisible();
    const board = await box(page.locator('.trainer__board').first());
    const card = await box(menu);
    const overlap =
      card.x < board.x + board.width &&
      board.x < card.x + card.width &&
      card.y < board.y + board.height &&
      board.y < card.y + card.height;
    expect(overlap).toBe(false);
    await expectNoSidewaysScroll(page);
  });

  test('Settings’ tabs come in even rows on a phone, each the full width', async ({ page }) => {
    test.skip(!isPhone(page), 'wide screens have room for the tabs in one row');
    await page.goto('/settings');
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible();
    const boxes = await Promise.all((await tabs.all()).map((tab) => box(tab)));
    const rows = new Map<number, typeof boxes>();
    for (const b of boxes) {
      const key = Math.round(b.y);
      rows.set(key, [...(rows.get(key) ?? []), b]);
    }
    const list = await box(page.getByRole('tablist'));
    for (const row of rows.values()) {
      // The tabs of a row share it evenly, and the last one ends where the bar ends.
      const widths = row.map((b) => b.width);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
      const last = row.reduce((a, b) => (b.x > a.x ? b : a));
      expect(list.x + list.width - (last.x + last.width)).toBeLessThanOrEqual(12);
    }
    await expectNoSidewaysScroll(page);
  });

  for (const route of ['/placement', '/learn/recall']) {
    test(`${route} starts on the page’s left edge, under its title`, async ({ page }) => {
      await page.goto(route);
      const title = await box(page.getByRole('heading', { level: 1 }));
      const card = await box(page.locator('main .card').first());
      expect(Math.abs(card.x - title.x)).toBeLessThanOrEqual(2);
    });
  }

  test('a key chip shows only while its key works', async ({ page }) => {
    test.skip(isPhone(page), 'touch screens show no key chips');
    await page.goto('/learn/basic-checkmates?step=2');
    const hint = page.getByRole('button', { name: /^Hint/ });
    await expect(hint.locator('kbd')).toHaveText('H');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Play' }).click();
    const toggle = page.getByRole('switch', { name: 'Single-key shortcuts' });
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.goto('/learn/basic-checkmates?step=2');
    await expect(page.getByRole('button', { name: /^Hint/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hint/ }).locator('kbd')).toHaveCount(0);
  });
});
