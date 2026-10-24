import { expect, type Page, test } from '@playwright/test';

const fixture =
  '/src/lib/core/component/LexicalMarkdown/component/decorator/browser-test/unavailable-mention.html';

const cases = [
  ['Deleted event', 'Deleted', 'This event was deleted or cancelled.'],
  [
    'Deleted document',
    'Deleted',
    "This document was deleted or doesn't exist.",
  ],
  ['Deleted channel', 'Deleted', "This channel was deleted or doesn't exist."],
  ['Hidden event', 'No Access', "You don't have access to this event"],
] as const;

function chip(page: Page, label: string, name: string) {
  return page
    .getByRole('paragraph')
    .filter({ hasText: `${label}:` })
    .getByRole('link', { name });
}

for (const [label, name, card] of cases) {
  test(`clicking the ${label.toLowerCase()} chip keeps its card open`, async ({
    page,
  }) => {
    await page.goto(fixture);
    await expect(chip(page, label, name)).toBeVisible();

    await chip(page, label, name).click();
    await expect(page.getByText(card, { exact: true })).toBeVisible();
    await expect(page.getByText(/file/)).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.getByText(card, { exact: true })).toBeHidden();
  });
}

test('Enter on a selected deleted chip keeps its card open', async ({
  page,
}) => {
  await page.goto(fixture);
  const card = "This document was deleted or doesn't exist.";
  await expect(chip(page, 'Selected in an editor', 'Deleted')).toBeVisible();

  expect(
    await page.evaluate(() => window.pressEnterOnSelectedMention?.())
  ).toBe(true);
  await expect(page.getByText(card, { exact: true })).toBeVisible();
  await expect(page.getByText(/file/)).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  for (const [label, name, card] of cases) {
    test(`tapping the ${label.toLowerCase()} chip opens its card as a sheet`, async ({
      page,
    }) => {
      await page.goto(fixture);
      await expect(chip(page, label, name)).toBeVisible();

      // The hover card marks its trigger aria-disabled on touch, where it
      // shows nothing; a real tap still reaches the chip.
      await chip(page, label, name).tap({ force: true });
      const sheet = page.getByRole('dialog', { name: 'Preview' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText(card, { exact: true })).toBeVisible();
    });
  }
});
