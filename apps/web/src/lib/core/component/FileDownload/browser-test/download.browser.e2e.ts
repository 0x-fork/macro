import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const videoPath = new URL(
  '../../../../../features/block-pptx/browser-test/fixtures/clip.webm',
  import.meta.url
);

test.beforeEach(async ({ page }) => {
  const video = await readFile(videoPath);
  await page.route('**/file/download-video', (route) =>
    route.fulfill({ body: video, contentType: 'video/webm' })
  );
  await page.route('**/api/file/metadata/download-video', (route) =>
    route.fulfill({
      json: {
        file_id: 'download-video',
        file_name: 'Team demo.webm',
        content_type: 'video/webm',
        is_uploaded: true,
        owner_id: 'test-user',
        s3_key: 'test-video',
      },
    })
  );
  await page.goto('/');
});

test('downloads the original video from the message and expanded viewer', async ({
  page,
}) => {
  const action = 'Download';
  const clickDownload = async () => {
    await page
      .getByRole('button', { name: action, exact: true })
      .last()
      .click();
  };
  const firstDownload = page.waitForEvent('download');
  await clickDownload();
  const first = await firstDownload;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(first.suggestedFilename()).toBe('Team demo.webm');
  expect(await readFile((await first.path())!)).toEqual(
    await readFile(videoPath)
  );
  await page
    .getByRole('button', { name: 'Open video viewer', exact: true })
    .first()
    .click();
  const secondDownload = page.waitForEvent('download');
  await clickDownload();
  expect((await secondDownload).suggestedFilename()).toBe('Team demo.webm');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Open video viewer', exact: true }).first()
  ).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((body) => body.clientWidth)
  );
});

test('recovers from a failed transfer and never opens the viewer when downloading', async ({
  page,
}) => {
  let failed = false;
  const video = await readFile(videoPath);
  await page.route('**/file/download-video', (route) => {
    if (route.request().resourceType() === 'media' || failed)
      return route.fulfill({ body: video, contentType: 'video/webm' });
    failed = true;
    return route.fulfill({ status: 404 });
  });
  await page
    .getByRole('button', {
      name: 'Download',
      exact: true,
    })
    .click();
  await expect(page.locator('video[controls]')).toHaveCount(0);
  const saved = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Retry download', exact: true })
    .click();
  expect((await saved).suggestedFilename()).toBe('Team demo.webm');
  await expect(
    page.getByRole('button', {
      name: 'Download',
      exact: true,
    })
  ).toBeFocused();
});

test('the shared Drive and standalone header downloads through its visible action', async ({
  page,
}) => {
  await page.goto('/?header');
  const trigger = page.getByRole('button', {
    name: 'Download',
    exact: true,
  });
  const saved = page.waitForEvent('download');
  await trigger.click();
  const file = await saved;
  expect(file.suggestedFilename()).toBe('Team demo.webm');
  expect(await readFile((await file.path())!)).toEqual(
    await readFile(videoPath)
  );
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((body) => body.clientWidth)
  );
});

test('shares from a separate action after a transfer outlives browser activation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'userActivation', {
      value: { isActive: false },
    });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        Object.defineProperty(window, 'sharedFileName', {
          configurable: true,
          value: data.files?.[0]?.name,
        });
      },
    });
  });
  await page.reload();
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await share.click();
  await expect(
    page.getByText('File ready — tap Share', { exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, 'sharedFileName'))
  ).toBeUndefined();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saving = page.waitForEvent('download');
  const download = page.getByRole('button', { name: 'Download', exact: true });
  await download.click();
  expect((await saving).suggestedFilename()).toBe('Team demo.webm');
  await expect(download).toBeFocused();
  await share.click();
  await expect(
    page.getByText('File ready — tap Share', { exact: true })
  ).toBeVisible();
  await share.click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'sharedFileName')))
    .toBe('Team demo.webm');
  await expect(share).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((body) => body.clientWidth)
  );
});
