import { expect, test } from '@playwright/test';

const fixture =
  '/src/lib/core/component/LexicalMarkdown/component/decorator/browser-test/calendar-mention.html';
const gone = 'This event was deleted or cancelled.';

test('clicking a deleted calendar mention keeps its card open', async ({
  page,
}) => {
  await page.goto(fixture);
  const chip = page.getByRole('link', { name: 'Deleted' });
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(page.getByText(gone, { exact: true })).toBeVisible();
  await expect(page.getByText(/file exists/)).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.getByText(gone, { exact: true })).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('tapping a deleted calendar mention opens its card as a sheet', async ({
    page,
  }) => {
    await page.goto(fixture);
    const chip = page.getByRole('link', { name: 'Deleted' });
    await expect(chip).toBeVisible();

    // The hover card marks its trigger aria-disabled on touch, where it shows
    // nothing; a real tap still reaches the chip.
    await chip.tap({ force: true });
    const sheet = page.getByRole('dialog', { name: 'Preview' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(gone, { exact: true })).toBeVisible();
  });
});
