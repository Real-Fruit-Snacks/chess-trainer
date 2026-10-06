import { expect, type Page, test } from '@playwright/test';
import { continueLesson, expectBoard } from './helpers';

/**
 * 0.12: Learn, recall, courses, Home and the reference — the fixes from the
 * 0.11 review ("Show answer" is a miss on the recall page, a lesson opened from
 * a course leads back to it, a returning learner's day comes first on Home,
 * the hero board's colours, glossary markup and the reference on a phone).
 */
const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>, version = 7) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version })] as const,
  );
}

/** A recall card for the first task of "How the pieces move", due a minute ago. */
async function seedDueRecallCard(page: Page) {
  await page.addInitScript((storageKey) => {
    if (localStorage.getItem(storageKey)) return;
    const id = 'how-pieces-move:0';
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          onboarded: true,
          puzzleRating: 1200,
          lessonRecall: {
            [id]: {
              id,
              rating: 0,
              themes: 'how-pieces-move',
              step: 1,
              due: Date.now() - 60_000,
              lapses: 0,
              addedAt: 1,
            },
          },
        },
        version: 7,
      }),
    );
  }, PROGRESS_KEY);
}

/** The stored recall card, as the page left it. */
async function storedCard(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const state = raw
      ? (
          JSON.parse(raw) as {
            state: { lessonRecall: Record<string, { step: number; lapses: number; due: number }> };
          }
        ).state
      : null;
    return state?.lessonRecall['how-pieces-move:0'] ?? null;
  }, PROGRESS_KEY);
}

test.describe('lesson recall', () => {
  test('"Show answer" is recorded as a miss and the position comes back tomorrow', async ({
    page,
  }) => {
    await seedDueRecallCard(page);
    await page.goto('/learn/recall');
    await expectBoard(page);
    // The badge names the schedule step an interval, not a lesson step.
    await expect(page.getByTestId('recall-interval')).toHaveText('Interval 2 of 5');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByTestId('recall-result')).toHaveText('Missed — it comes back tomorrow.');
    const card = await storedCard(page);
    expect(card?.step).toBe(0);
    expect(card?.lapses).toBe(1);
    expect(card?.due ?? 0).toBeGreaterThan(Date.now());
  });

  test('Learn shows what is due and leads to the recall page', async ({ page }) => {
    await seedDueRecallCard(page);
    await page.goto('/learn');
    const recall = page.getByTestId('learn-recall');
    await expect(recall).toContainText('1 position due now');
    await recall.getByRole('link', { name: 'Recall now' }).click();
    await expect(page).toHaveURL(/\/learn\/recall$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Recall' })).toBeVisible();
  });
});

test.describe('courses', () => {
  test('a lesson opened from a course offers "Back to course" and the next item', async ({
    page,
  }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200, tourDismissed: true });
    await page.goto('/learn/course/first-steps');
    await page.getByTestId('course-continue').click();
    await expect(page).toHaveURL(/\/learn\/the-board\?course=first-steps/);
    const back = page.getByTestId('back-to-course');
    await expect(back).toHaveText('First steps');
    await expect(back).toHaveAttribute('href', '/learn/course/first-steps');

    // Work through the lesson with "Show answer", then look at the closing card.
    await expectBoard(page);
    const next = page.locator('button:has-text("Finish"), button:has-text("Continue")').first();
    for (let i = 0; i < 8; i++) {
      await page
        .locator(
          'button:has-text("Show answer"), button:has-text("Finish"), button:has-text("Continue")',
        )
        .first()
        .waitFor();
      const show = page.getByRole('button', { name: 'Show answer' });
      if (await show.isVisible()) {
        await show.click();
        await next.waitFor();
      }
      const finish = page.getByRole('button', { name: /Finish/ });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await continueLesson(page);
    }
    await expect(page.getByTestId('lesson-end-title')).toHaveText('Lesson complete');
    const nextInCourse = page.getByTestId('next-in-course');
    await expect(nextInCourse).toHaveText(/^Next in course: How the pieces move/);
    await expect(nextInCourse).toHaveAttribute(
      'href',
      /\/learn\/how-pieces-move\?course=first-steps$/,
    );
    await page.getByRole('link', { name: 'Back to course', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'First steps' })).toBeVisible();
  });
});

test.describe('home', () => {
  test('a returning learner sees "Today" first, without the introduction', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200, tourDismissed: true });
    await page.goto('/');
    const today = page.getByTestId('home-today');
    await expect(today).toBeVisible();
    await expect(page.locator('.hero')).toHaveCount(0);
    // The day is the first thing on the page: no visible heading comes before "Today".
    const firstHeading = await page.locator('main :is(h1, h2):visible').evaluateAll(
      (els) =>
        els.find((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 1 && box.height > 1;
        })?.textContent ?? '',
    );
    expect(firstHeading.trim()).toBe('Today');
    // There is still exactly one h1, for screen readers.
    await expect(page.locator('main h1')).toHaveCount(1);
  });

  test('a newcomer gets the introduction, and its board has a1 dark', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn chess');
    const board = page.getByTestId('hero-board');
    await expect(board.locator('[data-square="a1"]')).toHaveClass(/miniboard__sq--dark/);
    await expect(board.locator('[data-square="h8"]')).toHaveClass(/miniboard__sq--dark/);
    await expect(board.locator('[data-square="h1"]')).not.toHaveClass(/miniboard__sq--dark/);
    await expect(board.locator('[data-square="a8"]')).not.toHaveClass(/miniboard__sq--dark/);
    // The d1 queen stands on its own colour: a light square.
    await expect(board.locator('[data-square="d1"]')).not.toHaveClass(/miniboard__sq--dark/);
  });
});

test.describe('reference', () => {
  test('glossary definitions render their markup instead of asterisks', async ({ page }) => {
    await page.goto('/reference');
    const glossary = page.getByTestId('glossary');
    const opposition = glossary.locator('.reference__entry', { hasText: 'Opposition' });
    await expect(opposition.locator('dd em')).toHaveText('not');
    await expect(opposition.locator('dd')).not.toContainText('*');
    expect(await glossary.innerText()).not.toMatch(/\*/);
    // The terms the app prints are explained.
    await expect(glossary).toContainText('DTZ (distance to zeroing)');
    await expect(glossary).toContainText('Woodpecker method');
  });
});

test.describe('reference on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('nothing on /reference scrolls sideways', async ({ page }) => {
    await page.goto('/reference');
    await expect(page.getByRole('heading', { level: 1, name: 'Reference' })).toBeVisible();
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      widest: Math.max(
        ...Array.from(
          document.querySelectorAll<HTMLElement>('main .card, main .reference__entry'),
          (el) => el.getBoundingClientRect().right,
        ),
      ),
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    expect(widths.widest).toBeLessThanOrEqual(widths.viewport);
  });
});
