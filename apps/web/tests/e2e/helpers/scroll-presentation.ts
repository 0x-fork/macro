import type { Page } from '@playwright/test';

type ResizeObserverDelayState = {
  matchedCallbacks: number;
  releaseAt?: number;
};

type BottomPresentationSample = {
  time: number;
  distanceFromBottom: number;
};

type TargetPresentationSample = {
  time: number;
  center: number;
  fullyVisible: boolean;
};

export type BottomPresentationReport = {
  first?: BottomPresentationSample;
  firstViolation?: BottomPresentationSample;
  violationCount: number;
};

export type TargetPresentationReport = {
  firstVisible?: TargetPresentationSample;
  largestShiftAfterVisible: number;
  firstVisibilityLoss?: TargetPresentationSample;
  visibilityLossCount: number;
  lastChangeAt?: number;
};

declare global {
  interface Window {
    __e2eResizeObserverDelay?: ResizeObserverDelayState;
    __e2eBottomPresentation?: BottomPresentationReport;
    __e2eTargetPresentation?: TargetPresentationReport;
    __e2eStopTargetPresentation?: () => void;
  }
}

/**
 * Sample painted target positions. Once the target is fully visible, any later
 * movement or visibility loss is a user-visible second-pass correction.
 */
export async function observeTargetPresentation(
  page: Page,
  scrollSelector: string,
  targetSelector: string,
  tolerancePx = 1
) {
  await page.addInitScript(
    ({ scrollSelector, targetSelector, tolerancePx }) => {
      const report: TargetPresentationReport = {
        largestShiftAfterVisible: 0,
        visibilityLossCount: 0,
      };
      window.__e2eTargetPresentation = report;
      let stopped = false;
      let previousSample: TargetPresentationSample | undefined;

      const verify = () => {
        if (stopped) return;

        const scroller = document.querySelector<HTMLElement>(scrollSelector);
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (scroller && target) {
          const scrollRect = scroller.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const sample: TargetPresentationSample = {
            time: performance.now(),
            center:
              targetRect.top +
              targetRect.height / 2 -
              (scrollRect.top + scrollRect.height / 2),
            fullyVisible:
              targetRect.top >= scrollRect.top - tolerancePx &&
              targetRect.bottom <= scrollRect.bottom + tolerancePx,
          };

          if (!report.firstVisible && sample.fullyVisible) {
            report.firstVisible = sample;
            report.lastChangeAt = sample.time;
          } else if (report.firstVisible) {
            if (
              !previousSample ||
              Math.abs(sample.center - previousSample.center) > tolerancePx ||
              sample.fullyVisible !== previousSample.fullyVisible
            ) {
              report.lastChangeAt = sample.time;
            }
            report.largestShiftAfterVisible = Math.max(
              report.largestShiftAfterVisible,
              Math.abs(sample.center - report.firstVisible.center)
            );
            if (!sample.fullyVisible) {
              report.firstVisibilityLoss ??= sample;
              report.visibilityLossCount += 1;
            }
          }
          previousSample = sample;
        }

        schedulePostPaintCheck();
      };

      const schedulePostPaintCheck = () => {
        requestAnimationFrame(() => window.setTimeout(verify, 0));
      };

      window.__e2eStopTargetPresentation = () => {
        stopped = true;
      };
      schedulePostPaintCheck();
    },
    { scrollSelector, targetSelector, tolerancePx }
  );

  return {
    waitForQuietAndRead: async (quietMs = 250) => {
      await page.waitForFunction(
        (quiet) => {
          const report = window.__e2eTargetPresentation;
          return (
            report?.firstVisible !== undefined &&
            report.lastChangeAt !== undefined &&
            performance.now() - report.lastChangeAt >= quiet
          );
        },
        quietMs,
        { timeout: 5000 }
      );
      return page.evaluate(() => {
        window.__e2eStopTargetPresentation?.();
        return window.__e2eTargetPresentation as TargetPresentationReport;
      });
    },
  };
}

/**
 * Delay ResizeObserver callbacks for a DOM subtree to make layout races deterministic.
 * When `activateWhenSelector` is set, callbacks remain native until that element exists.
 */
export async function delayResizeObserverFor(
  page: Page,
  selector: string,
  delayMs: number,
  activateWhenSelector?: string
) {
  await page.addInitScript(
    ({ selector, delayMs, activateWhenSelector }) => {
      const NativeResizeObserver = window.ResizeObserver;
      const state: ResizeObserverDelayState = { matchedCallbacks: 0 };
      window.__e2eResizeObserverDelay = state;

      class DelayedResizeObserver implements ResizeObserver {
        private readonly observer: ResizeObserver;
        private queuedEntries?: ResizeObserverEntry[];
        private timer?: number;
        private disconnected = false;

        constructor(callback: ResizeObserverCallback) {
          this.observer = new NativeResizeObserver((entries) => {
            const matchesSubtree = entries.some(
              ({ target }) =>
                target.matches(selector) || target.closest(selector) !== null
            );
            const isActivated =
              !activateWhenSelector ||
              document.querySelector(activateWhenSelector) !== null;
            if (!matchesSubtree || !isActivated) {
              callback(entries, this);
              return;
            }

            state.matchedCallbacks += 1;
            state.releaseAt ??= performance.now() + delayMs;
            const remaining = state.releaseAt - performance.now();
            if (remaining <= 0) {
              callback(entries, this);
              return;
            }

            this.queuedEntries = entries;
            if (this.timer !== undefined) return;
            this.timer = window.setTimeout(() => {
              this.timer = undefined;
              const pendingEntries = this.queuedEntries;
              this.queuedEntries = undefined;
              if (!this.disconnected && pendingEntries) {
                callback(pendingEntries, this);
              }
            }, remaining);
          });
        }

        observe(target: Element, options?: ResizeObserverOptions) {
          this.observer.observe(target, options);
        }

        unobserve(target: Element) {
          this.observer.unobserve(target);
        }

        disconnect() {
          this.disconnected = true;
          if (this.timer !== undefined) window.clearTimeout(this.timer);
          this.observer.disconnect();
        }
      }

      window.ResizeObserver = DelayedResizeObserver;
    },
    { selector, delayMs, activateWhenSelector }
  );

  return {
    async waitForRelease() {
      await page.waitForFunction(() => {
        const releaseAt = window.__e2eResizeObserverDelay?.releaseAt;
        return releaseAt !== undefined && performance.now() >= releaseAt;
      });
      // Let released measurements and their resulting render commit.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      return page.evaluate(() => window.__e2eResizeObserverDelay);
    },
  };
}

/** Observe the post-paint bottom distance of every visible overflowing frame. */
export async function observeBottomPresentation(
  page: Page,
  selector: string,
  tolerancePx = 1
) {
  await page.addInitScript(
    ({ selector, tolerancePx }) => {
      const report: BottomPresentationReport = { violationCount: 0 };
      window.__e2eBottomPresentation = report;

      const verify = () => {
        const scroller = document.querySelector<HTMLElement>(selector);
        if (scroller) {
          const style = getComputedStyle(scroller);
          const visible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            scroller.getClientRects().length > 0;
          const overflowing = scroller.scrollHeight > scroller.clientHeight;

          if (visible && overflowing) {
            const sample = {
              time: performance.now(),
              distanceFromBottom:
                scroller.scrollHeight -
                scroller.clientHeight -
                scroller.scrollTop,
            };
            report.first ??= sample;
            if (sample.distanceFromBottom > tolerancePx) {
              report.firstViolation ??= sample;
              report.violationCount += 1;
            }
          }
        }

        schedulePostPaintCheck();
      };

      // Timers queued from rAF run after that frame's paint. This observes what
      // a user could see without racing the app's own rAF corrections.
      const schedulePostPaintCheck = () => {
        requestAnimationFrame(() => window.setTimeout(verify, 0));
      };

      schedulePostPaintCheck();
    },
    { selector, tolerancePx }
  );

  return {
    read: () =>
      page.evaluate(
        () => window.__e2eBottomPresentation as BottomPresentationReport
      ),
  };
}
