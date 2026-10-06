import { expect, type Page, test } from '@playwright/test';
import { expectBoard } from './helpers';

/**
 * 0.18: a lesson can be marked done without working through it — from its card
 * on Learn, its row in a course or its own page — and marked not done again,
 * each with an Undo. A marked lesson counts as completed, not as training.
 */
const PROGRESS_KEY = 'chess-trainer:progress';

async function seedProgress(page: Page, state: Record<string, unknown>) {
  await page.addInitScript(
    ([storageKey, value]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, value);
    },
    [PROGRESS_KEY, JSON.stringify({ state, version: 8 })] as const,
  );
}

async function storedLesson(page: Page, id: string) {
  return page.evaluate(
    ([key, lessonId]) => {
      const raw = localStorage.getItem(key);
      const lessons = raw
        ? (JSON.parse(raw) as { state: { lessons?: Record<string, unknown> } }).state.lessons
        : undefined;
      return lessons?.[lessonId] ?? null;
    },
    [PROGRESS_KEY, id] as const,
  );
}

test.describe('marking lessons done', () => {
  test.beforeEach(async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200, tourDismissed: true });
  });

  test('from Learn: the card counts as completed, Undo takes it back, a reload keeps it', async ({
    page,
  }) => {
    await page.goto('/learn');
    await expect(page.getByText('0 of 75 lessons completed')).toBeVisible();
    const check = page.getByRole('checkbox', { name: 'Mark as done: The board and the notation' });
    await expect(check).toHaveAttribute('aria-checked', 'false');
    await check.click();
    await expect(check).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('1 of 75 lessons completed')).toBeVisible();
    // Up next moves on to the following lesson.
    await expect(page.getByText('Up next: How the pieces move')).toBeVisible();
    const toast = page.locator('.toast', {
      hasText: '“The board and the notation” is marked done.',
    });
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(check).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('0 of 75 lessons completed')).toBeVisible();
    expect(await storedLesson(page, 'the-board')).toBeNull();

    await check.click();
    await page.reload();
    await expect(
      page.getByRole('checkbox', { name: 'Mark as done: The board and the notation' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(await storedLesson(page, 'the-board')).toMatchObject({ marked: true, stepsDone: [] });
    // Not training: the streak has not started.
    const days = await page.evaluate(
      (key) =>
        (JSON.parse(localStorage.getItem(key) ?? '{}') as { state?: { trainingDays?: string[] } })
          .state?.trainingDays ?? [],
      PROGRESS_KEY,
    );
    expect(days).toEqual([]);
  });

  test('from a course: the step is ticked and the course moves on', async ({ page }) => {
    await page.goto('/learn/course/first-steps');
    await expect(page.getByText(/^0 of 20 steps done$/)).toBeVisible();
    await page.getByRole('checkbox', { name: 'Mark as done: The board and the notation' }).click();
    await expect(page.getByText(/^1 of 20 steps done$/)).toBeVisible();
    await expect(page.getByText('Up next: Lesson: How the pieces move (The rules)')).toBeVisible();
  });

  test('from the lesson page, and not done again: it starts over at the first step', async ({
    page,
  }) => {
    await page.goto('/learn/forks');
    await expectBoard(page);
    await page.getByTestId('lesson-done-toggle').click();
    await expect(page.getByTestId('lesson-done-toggle')).toHaveText('Mark as not done');
    await expect(page.locator('.toast', { hasText: '“Forks” is marked done.' })).toBeVisible();
    expect(await storedLesson(page, 'forks')).toMatchObject({ marked: true });

    await page.getByTestId('lesson-done-toggle').click();
    await expect(page.getByTestId('lesson-done-toggle')).toHaveText('Mark as done');
    expect(await storedLesson(page, 'forks')).toMatchObject({ completedAt: null, stepsDone: [] });
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the board puts every piece on its square', async ({ page }) => {
    await seedProgress(page, { onboarded: true, puzzleRating: 1200, tourDismissed: true });
    await page.goto('/learn/forks');
    const board = await expectBoard(page);
    await page.waitForTimeout(500);
    // A transition on the board's size used to leave the pieces placed for the size the
    // board had a frame earlier: the h-file stuck out, highlights sat off their squares.
    const placement = await board.evaluate((cg) => {
      const size = cg.getBoundingClientRect().width / 8;
      return [...cg.querySelectorAll('piece')].map((piece) => {
        // "translate(56px, 112px)"; Firefox writes a zero offset as "translate(56px)", and
        // "none" for a piece in the corner.
        const match = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(
          (piece as HTMLElement).style.transform,
        );
        const x = match ? Number(match[1]) / size : 0;
        const y = match ? Number(match[2] ?? 0) / size : 0;
        return { x, y };
      });
    });
    expect(placement?.length).toBeGreaterThan(0);
    for (const { x, y } of placement ?? []) {
      expect(Math.abs(x - Math.round(x))).toBeLessThan(0.02);
      expect(Math.abs(y - Math.round(y))).toBeLessThan(0.02);
      expect(Math.round(x)).toBeLessThanOrEqual(7);
      expect(Math.round(y)).toBeLessThanOrEqual(7);
    }
  });
});
