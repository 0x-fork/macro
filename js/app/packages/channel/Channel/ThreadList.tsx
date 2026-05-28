import { CustomScrollbar } from '@core/component/CustomScrollbar';
import {
  createScrollIntentTracker,
  type ScrollDirection,
} from '@core/util/scroll-intent';
import { type Accessor, createSignal, type JSX, onCleanup } from 'solid-js';
import { Virtualizer, type VirtualizerHandle } from 'virtua/solid';
import type { ScrollToIndexOpts } from 'virtua/unstable_core';
import { NEAR_BOTTOM_THRESHOLD } from './constants';

const BASE_ITEM_SIZE: number = 64;
const BASE_BUFFER_SIZE: number = BASE_ITEM_SIZE;

type ScrollAlignment = ScrollToIndexOpts['align'];

export type ThreadListScrollTarget =
  | { tag: 'top'; align?: ScrollAlignment }
  | { tag: 'bottom'; align?: ScrollAlignment }
  | { tag: 'index'; index: number; align?: ScrollAlignment }
  | { tag: 'id'; id: string; align?: ScrollAlignment };

export function defaultThreadListTargetFromMessage(
  targetMessageId: string | undefined
): ThreadListScrollTarget {
  if (targetMessageId) {
    return {
      tag: 'id',
      id: targetMessageId,
    };
  }
  return DEFAULT_INITIAL_SCROLL_TARGET;
}

export type ThreadListNavigation = {
  scrollTo: (target: ThreadListScrollTarget) => boolean;
  scrollToIndex: (index: number, opts?: { align?: ScrollAlignment }) => boolean;
  scrollByDelta: (delta: number, opts?: { align?: ScrollAlignment }) => boolean;
  scrollToTop: (align?: ScrollAlignment) => boolean;
  scrollToBottom: (align?: ScrollAlignment) => boolean;
  scrollToId: (id: string, opts?: { align?: ScrollAlignment }) => boolean;
  navigatePrevious: () => boolean;
  navigateNext: () => boolean;
  isNearBottom: () => boolean;
  /**
   * Signal that a user-initiated navigation is about to cause a
   * programmatic scroll. Call this before `scrollToId` etc. from
   * hotkey handlers so the resulting scroll is treated as user-driven
   * for pagination purposes.
   */
  markUserIntent: (direction: ScrollDirection) => void;
};

export type ThreadListScrollState = {
  didInitialScroll: boolean;
  isNearBottom: boolean;
  isScrollingDown: boolean;
  distanceFromTop: number;
  distanceFromBottom: number;
  viewportSize: number;
};

type ThreadListProps = {
  keys: Accessor<string[]>;
  children: (item: { id: string }) => JSX.Element;
  initialScrollTarget?: ThreadListScrollTarget;
  onScrollNearTop?: () => void;
  onScrollNearBottom?: () => void;
  onNavigationReady?: (navigation: ThreadListNavigation) => void;
  onScrollStateChange?: (state: ThreadListScrollState) => void;
  shift?: Accessor<boolean>;
  prepend?: Accessor<boolean>;
};

const NEAR_TOP_THRESHOLD = 800;
const EXPLICIT_SCROLL_DOWN_TRIGGER_DISTANCE = 64;

/**
 * Upper bound on how long the initial scroll may keep re-pinning to its target
 * before we reveal the list anyway. The list is kept hidden until the initial
 * scroll settles, so this also bounds how long a cold open can stay blank if
 * row heights never fully stabilize (e.g. media that keeps resizing).
 */
const INITIAL_SCROLL_SETTLE_BUDGET_MS = 600;

export const DEFAULT_INITIAL_SCROLL_TARGET: ThreadListScrollTarget = {
  tag: 'bottom',
  align: 'end',
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

export function getTargetAlign(
  target: ThreadListScrollTarget
): ScrollAlignment {
  if (target.align) return target.align;
  switch (target.tag) {
    case 'top':
      return 'start';
    case 'bottom':
      return 'end';
    case 'index':
    case 'id':
      return 'center';
  }
}

export function ThreadList(props: ThreadListProps) {
  const [virtualHandle, setVirtualHandle] = createSignal<VirtualizerHandle>();
  const [isNearBottom, setIsNearBottom] = createSignal(true);
  const [didInitialScroll, setDidInitialScroll] = createSignal(false);
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();

  let scrollRef: HTMLDivElement | undefined;
  let nearTopFired = false;
  let nearBottomFired = false;
  let previousScrollOffset: number | undefined;
  let explicitScrollDownDistance = 0;

  const scrollIntent = createScrollIntentTracker();

  let initialScrollStarted = false;
  let initialScrollTarget: ThreadListScrollTarget =
    DEFAULT_INITIAL_SCROLL_TARGET;
  let settleRafId: number | undefined;

  const cancelSettleLoop = () => {
    if (settleRafId !== undefined) {
      cancelAnimationFrame(settleRafId);
      settleRafId = undefined;
    }
  };

  const resetInitialScroll = () => {
    initialScrollStarted = false;
    initialScrollTarget = DEFAULT_INITIAL_SCROLL_TARGET;
    cancelSettleLoop();
  };

  onCleanup(cancelSettleLoop);

  const resolveTargetIndex = (target: ThreadListScrollTarget): number => {
    const keys = props.keys();
    const maxIndex = keys.length - 1;
    if (maxIndex < 0) return -1;

    switch (target.tag) {
      case 'top':
        return 0;
      case 'bottom':
        return maxIndex;
      case 'index':
        return clamp(target.index, 0, maxIndex);
      case 'id': {
        const idx = keys.indexOf(target.id);
        return idx === -1 ? -1 : idx;
      }
    }
  };

  const scrollToTarget = (
    handle: VirtualizerHandle,
    target: ThreadListScrollTarget
  ): boolean => {
    const index = resolveTargetIndex(target);
    if (index < 0) return false;
    handle.scrollToIndex(index, { align: getTargetAlign(target) });
    return true;
  };

  const getDistanceFromBottom = (handle: VirtualizerHandle): number =>
    handle.scrollSize - handle.viewportSize - handle.scrollOffset;

  const isScrollPositionCorrect = (
    handle: VirtualizerHandle,
    target: ThreadListScrollTarget
  ): boolean => {
    switch (target.tag) {
      case 'bottom':
        return getDistanceFromBottom(handle) <= NEAR_BOTTOM_THRESHOLD;
      case 'top':
        return handle.scrollOffset <= NEAR_BOTTOM_THRESHOLD;
      case 'id':
      case 'index': {
        const targetIndex = resolveTargetIndex(target);
        if (targetIndex < 0) return true; // target gone, nothing to verify
        const currentIndex = handle.findItemIndex(handle.scrollOffset);
        // Consider correct if the target is within a reasonable range of
        // the current viewport (within ±5 items accounts for alignment).
        return Math.abs(currentIndex - targetIndex) <= 5;
      }
    }
  };

  const getCurrentIndex = (handle: VirtualizerHandle): number => {
    const itemCount = props.keys().length;
    if (!itemCount) return -1;
    return clamp(handle.findItemIndex(handle.scrollOffset), 0, itemCount - 1);
  };

  const emitScrollState = (
    handle: VirtualizerHandle,
    isScrollingDown: boolean
  ) => {
    if (!props.onScrollStateChange) return;
    const distanceFromTop = handle.scrollOffset;
    const distanceFromBottom = getDistanceFromBottom(handle);
    props.onScrollStateChange({
      didInitialScroll: didInitialScroll(),
      isNearBottom: distanceFromBottom <= NEAR_BOTTOM_THRESHOLD,
      isScrollingDown,
      distanceFromTop,
      distanceFromBottom,
      viewportSize: handle.viewportSize,
    });
  };

  /** Mark the initial scroll as complete and broadcast the scroll state. */
  const completeInitialScroll = (handle: VirtualizerHandle) => {
    if (didInitialScroll()) return;
    cancelSettleLoop();
    setDidInitialScroll(true);
    emitScrollState(handle, false);
  };

  const createNavigation = (
    handle: VirtualizerHandle
  ): ThreadListNavigation => ({
    scrollTo: (target) => scrollToTarget(handle, target),

    scrollToIndex: (index, opts = {}) =>
      scrollToTarget(handle, { tag: 'index', index, align: opts.align }),

    scrollByDelta: (delta, opts = {}) => {
      const current = getCurrentIndex(handle);
      if (current < 0) return false;
      return scrollToTarget(handle, {
        tag: 'index',
        index: current + delta,
        align: opts.align,
      });
    },

    scrollToTop: (align = 'start') =>
      scrollToTarget(handle, { tag: 'top', align }),

    scrollToBottom: (align = 'end') =>
      scrollToTarget(handle, { tag: 'bottom', align }),

    scrollToId: (id, opts = {}) =>
      scrollToTarget(handle, { tag: 'id', id, align: opts.align }),

    navigatePrevious: () => {
      const current = getCurrentIndex(handle);
      if (current <= 0) return false;
      return scrollToTarget(handle, { tag: 'index', index: current - 1 });
    },

    navigateNext: () => {
      const current = getCurrentIndex(handle);
      if (current < 0) return false;
      return scrollToTarget(handle, { tag: 'index', index: current + 1 });
    },

    isNearBottom,

    markUserIntent: scrollIntent.markUserIntent,
  });

  function scrollOnMount(handle: VirtualizerHandle) {
    if (initialScrollStarted) return;
    initialScrollStarted = true;

    const target = props.initialScrollTarget ?? DEFAULT_INITIAL_SCROLL_TARGET;
    initialScrollTarget = target;

    console.debug('ThreadList: scrollOnMount', {
      target,
      itemCount: props.keys().length,
      scrollOffset: handle.scrollOffset,
      scrollSize: handle.scrollSize,
      viewportSize: handle.viewportSize,
    });

    const didScroll = scrollToTarget(handle, target);

    if (!didScroll) {
      // Empty list or target not found — nothing to verify.
      console.debug(
        'ThreadList: target not resolvable, completing immediately'
      );
      completeInitialScroll(handle);
      return;
    }

    // The first scrollToIndex aims at the *estimated* position of the target,
    // but real row heights (markdown, attachments, thread replies, images that
    // load in) differ from the 64px estimate, so the target keeps moving as
    // rows are measured. Re-pin to the target each frame until the position is
    // stable (or the time budget elapses). The list stays visually hidden
    // until this completes (see `didInitialScroll` -> opacity), so the user
    // never sees it converge from the estimated position to the true bottom.
    startSettleLoop(handle);
  }

  /**
   * Re-pin to the initial scroll target each animation frame until the scroll
   * position settles, then mark the initial scroll complete. Runs while the
   * list is hidden so no intermediate position is shown, and is bounded by
   * `INITIAL_SCROLL_SETTLE_BUDGET_MS` so a cold open can never stay blank.
   *
   * Row heights are only known after the virtualizer measures them (a
   * ResizeObserver pass that lands *after* this frame's rAF), so the target's
   * true position keeps moving until measured sizes stop changing. We treat
   * the position as final only once it is within tolerance AND the measured
   * `scrollSize` has stabilized across two consecutive frames. Without the
   * stability check, the first frame would read "at the bottom" against the
   * still-estimated size and reveal the list mid-convergence — exactly the
   * "renders in the middle, then jumps to the bottom" glitch.
   */
  function startSettleLoop(handle: VirtualizerHandle) {
    cancelSettleLoop();
    const startedAt = performance.now();
    let previousScrollSize = -1;

    const step = () => {
      settleRafId = undefined;
      if (didInitialScroll()) return;

      const scrollSize = handle.scrollSize;
      // Tolerance (not strict equality) so sub-pixel measurement jitter from
      // fractional row heights doesn't keep the loop running until the budget.
      const sizeStable = Math.abs(scrollSize - previousScrollSize) <= 1;

      if (sizeStable && isScrollPositionCorrect(handle, initialScrollTarget)) {
        completeInitialScroll(handle);
        return;
      }

      if (performance.now() - startedAt >= INITIAL_SCROLL_SETTLE_BUDGET_MS) {
        // Give up waiting for a perfect landing — re-pin one last time so we
        // reveal as close to the target as possible, then show the list.
        console.warn('ThreadList: initial scroll settle budget exceeded', {
          target: initialScrollTarget,
          scrollOffset: handle.scrollOffset,
          scrollSize,
          viewportSize: handle.viewportSize,
          distanceFromBottom: getDistanceFromBottom(handle),
        });
        scrollToTarget(handle, initialScrollTarget);
        completeInitialScroll(handle);
        return;
      }

      // Not settled yet: re-aim at the target with the latest measurements and
      // re-check next frame, once more rows have been measured.
      previousScrollSize = scrollSize;
      scrollToTarget(handle, initialScrollTarget);
      settleRafId = requestAnimationFrame(step);
    };

    settleRafId = requestAnimationFrame(step);
  }

  const handleScroll = () => {
    const handle = virtualHandle();
    if (!handle) {
      console.warn(
        'Channel.ThreadList: handle scroll but the handle is undefined'
      );
      return;
    }

    const distanceFromTop = handle.scrollOffset;
    const distanceFromBottom = getDistanceFromBottom(handle);

    const nearTop = distanceFromTop <= NEAR_TOP_THRESHOLD;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;

    setIsNearBottom(nearBottom);
    let nextIsScrollingDown = false;

    if (previousScrollOffset !== undefined) {
      const delta = handle.scrollOffset - previousScrollOffset;
      // Accumulate downward scroll distance only during user interaction
      // and only when the user is scrolling down. Used by the scroll-to-bottom overlay.
      if (
        scrollIntent.isUserInteracting() &&
        delta > 0 &&
        scrollIntent.lastDirection() === 'down'
      ) {
        explicitScrollDownDistance += delta;
      } else {
        explicitScrollDownDistance = 0;
      }
      nextIsScrollingDown =
        explicitScrollDownDistance >= EXPLICIT_SCROLL_DOWN_TRIGGER_DISTANCE;
    }
    previousScrollOffset = handle.scrollOffset;
    emitScrollState(handle, nextIsScrollingDown);

    if (!didInitialScroll()) return;

    // Only trigger pagination callbacks when the user is actively
    // interacting with the scroll surface. This prevents synthetic
    // scroll events from the virtualizer (content resizes, layout
    // reflows, shift adjustments) from incorrectly loading more pages.
    const hasUserIntent = scrollIntent.isUserInteracting();

    if (nearTop && !nearTopFired && hasUserIntent) {
      nearTopFired = true;
      props.onScrollNearTop?.();
    } else if (!nearTop) {
      nearTopFired = false;
    }

    if (nearBottom && !nearBottomFired && hasUserIntent) {
      nearBottomFired = true;
      props.onScrollNearBottom?.();
    } else if (!nearBottom) {
      nearBottomFired = false;
    }
  };

  return (
    <>
      <div
        ref={(el) => {
          scrollRef = el;
          setScrollEl(el);
        }}
        data-channel-scroll
        class="scrollbar-hidden"
        {...scrollIntent.handlers}
        style={{
          width: '100%',
          'overflow-y': 'auto',
          'overflow-anchor': 'none',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
          // Keep the list hidden until the initial scroll has settled on its
          // target, so the user never sees it converge from the estimated
          // position to the true bottom. Opacity (not display/visibility)
          // preserves layout + measurement while hidden.
          opacity: didInitialScroll() ? 1 : 0,
          'pointer-events': didInitialScroll() ? 'auto' : 'none',
          transition: 'opacity 120ms ease-out',
        }}
      >
        <div style="flex-grow: 1" />
        <Virtualizer
          ref={(ref) => {
            if (!ref) return;
            setVirtualHandle(ref);
            if (props.onNavigationReady) {
              props.onNavigationReady(createNavigation(ref));
            }
            resetInitialScroll();
            scrollOnMount(ref);
          }}
          scrollRef={scrollRef}
          itemSize={BASE_ITEM_SIZE}
          bufferSize={BASE_BUFFER_SIZE}
          data={props.keys()}
          onScroll={handleScroll}
          shift={props.shift?.() ?? false}
        >
          {(key) => props.children({ id: key })}
        </Virtualizer>
      </div>
      <CustomScrollbar
        scrollContainer={scrollEl}
        enabled={didInitialScroll()}
      />
    </>
  );
}
