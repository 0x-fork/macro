import { expect, test } from '@playwright/test';

import { localE2ESeed } from './fixtures/local-e2e-seed';
import { gotoApp, LOCAL_E2E } from './helpers/local-app';
import {
  delayResizeObserverFor,
  observeTargetPresentation,
} from './helpers/scroll-presentation';

const CHANNEL_SCROLL_SELECTOR = '[data-channel-scroll]';
const POSITION_TOLERANCE_PX = 1;
const MAX_PRESENTED_TARGET_SHIFT_PX = 2;

test.skip(!LOCAL_E2E, 'requires the seeded local E2E stack');

test('lands on a deeply nested reply after the thread expands and measures', async ({
  page,
}) => {
  const channel = localE2ESeed.smoke.generalChannel;
  const thread = localE2ESeed.smoke.generalDeepThread;
  const targetSelector = `[data-message-id="${thread.targetReplyId}"]`;
  const resizeDelay = await delayResizeObserverFor(
    page,
    CHANNEL_SCROLL_SELECTOR,
    150,
    targetSelector
  );
  const presentation = await observeTargetPresentation(
    page,
    CHANNEL_SCROLL_SELECTOR,
    targetSelector
  );

  const params = new URLSearchParams({
    channel_message_id: thread.targetReplyId,
    channel_thread_id: thread.parentMessageId,
  });
  await gotoApp(page, `/channel/${channel.channel_id}?${params}`);

  const scroller = page.locator(CHANNEL_SCROLL_SELECTOR);
  const target = page.locator(targetSelector);
  await expect(scroller).toBeVisible({ timeout: 30_000 });
  await expect(target).toContainText(thread.targetReplyText, {
    timeout: 30_000,
  });
  await expect(target).toHaveAttribute('data-targeted', '');

  const resizeFault = await resizeDelay.waitForRelease();
  expect(resizeFault?.matchedCallbacks).toBeGreaterThan(0);

  // Observe through a full quiet window so releasing the one-shot target is
  // included; late virtualizer corrections are still visible jank.
  const presentationReport = await presentation.waitForQuietAndRead();
  expect(presentationReport.firstVisible).toBeDefined();
  expect(
    presentationReport.visibilityLossCount,
    JSON.stringify(presentationReport)
  ).toBe(0);
  expect(
    presentationReport.largestShiftAfterVisible,
    JSON.stringify(presentationReport)
  ).toBeLessThanOrEqual(MAX_PRESENTED_TARGET_SHIFT_PX);

  const position = await target.evaluate((element, scrollSelector) => {
    const scrollElement = document.querySelector(scrollSelector);
    if (!(scrollElement instanceof HTMLElement)) {
      throw new Error(`Missing channel scroller: ${scrollSelector}`);
    }

    const targetRect = element.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    return {
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      scrollTop: scrollRect.top,
      scrollBottom: scrollRect.bottom,
    };
  }, CHANNEL_SCROLL_SELECTOR);

  expect(position.targetTop).toBeGreaterThanOrEqual(
    position.scrollTop - POSITION_TOLERANCE_PX
  );
  expect(position.targetBottom).toBeLessThanOrEqual(
    position.scrollBottom + POSITION_TOLERANCE_PX
  );
});
