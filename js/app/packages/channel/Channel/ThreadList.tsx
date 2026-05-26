import { CustomScrollbar } from '@core/component/CustomScrollbar';
import {
  createScrollIntentTracker,
  type ScrollDirection,
} from '@core/util/scroll-intent';
import { createVirtualizer, type Virtualizer } from '@tanstack/solid-virtual';
import {
  type Accessor,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
} from 'solid-js';
import { NEAR_BOTTOM_THRESHOLD } from './constants';

const BASE_ITEM_SIZE: number = 64;
/** Rows to keep mounted past each viewport edge. virtua used a pixel buffer;
 *  TanStack counts items, so the old 64px buffer (~1 row) becomes a small
 *  overscan that keeps a couple of rows mounted to avoid blank flashes. */
const OVERSCAN: number = 6;

type ListVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

/** Alignment values accepted by the public navigation API. `'nearest'` is
 *  kept for callers (channel hotkeys) and maps onto TanStack's `'auto'`. */
type ScrollAlignment = 'start' | 'center' | 'end' | 'nearest';
type CoreAlignment = 'start' | 'center' | 'end' | 'auto';

const toCoreAlign = (align: ScrollAlignment): CoreAlignment =>
  align === 'nearest' ? 'auto' : align;

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
};

const NEAR_TOP_THRESHOLD = 800;
const EXPLICIT_SCROLL_DOWN_TRIGGER_DISTANCE = 64;
/** How long after the last scroll event we treat scrolling as settled.
 *  TanStack has no `onScrollEnd`, so we debounce native scroll events. */
const SCROLL_END_DEBOUNCE_MS = 120;

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

type ScrollMetrics = {
  scrollOffset: number;
  viewportSize: number;
  scrollSize: number;
  distanceFromTop: number;
  distanceFromBottom: number;
};

export function ThreadList(props: ThreadListProps) {
  const [isNearBottom, setIsNearBottom] = createSignal(true);
  const [didInitialScroll, setDidInitialScroll] = createSignal(false);
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();

  let scrollRef: HTMLDivElement | undefined;
  let nearTopFired = false;
  let nearBottomFired = false;
  let previousScrollOffset: number | undefined;
  let explicitScrollDownDistance = 0;
  let scrollEndTimer: ReturnType<typeof setTimeout> | undefined;

  const scrollIntent = createScrollIntentTracker();

  let initialScrollStarted = false;
  let initialScrollRetried = false;
  let initialScrollTarget: ThreadListScrollTarget =
    DEFAULT_INITIAL_SCROLL_TARGET;

  // anchorTo: 'end' keeps the visible item stable across data changes — this
  // is the TanStack equivalent of virtua's `shift` prop and removes the need
  // for the caller to flag prepends. getItemKey lets the virtualizer match
  // the same message across reorders so the anchor is preserved.
  const virtualizer: ListVirtualizer = createVirtualizer({
    get count() {
      return props.keys().length;
    },
    getScrollElement: () => scrollEl() ?? null,
    estimateSize: () => BASE_ITEM_SIZE,
    overscan: OVERSCAN,
    getItemKey: (index) => props.keys()[index] ?? index,
    anchorTo: 'end',
  });

  const resetInitialScroll = () => {
    initialScrollStarted = false;
    initialScrollRetried = false;
    initialScrollTarget = DEFAULT_INITIAL_SCROLL_TARGET;
  };

  const readMetrics = (): ScrollMetrics | undefined => {
    const el = scrollRef;
    if (!el) return undefined;
    const scrollOffset = el.scrollTop;
    const viewportSize = el.clientHeight;
    const scrollSize = el.scrollHeight;
    return {
      scrollOffset,
      viewportSize,
      scrollSize,
      distanceFromTop: scrollOffset,
      distanceFromBottom: scrollSize - viewportSize - scrollOffset,
    };
  };

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

  const scrollToTarget = (target: ThreadListScrollTarget): boolean => {
    if (target.tag === 'bottom') {
      if (props.keys().length === 0) return false;
      virtualizer.scrollToEnd({ behavior: 'auto' });
      return true;
    }
    const index = resolveTargetIndex(target);
    if (index < 0) return false;
    virtualizer.scrollToIndex(index, {
      align: toCoreAlign(getTargetAlign(target)),
    });
    return true;
  };

  const getCurrentIndex = (): number => {
    const itemCount = props.keys().length;
    if (!itemCount) return -1;
    const metrics = readMetrics();
    if (!metrics) return -1;
    const item = virtualizer.getVirtualItemForOffset(metrics.scrollOffset);
    if (!item) return -1;
    return clamp(item.index, 0, itemCount - 1);
  };

  const isScrollPositionCorrect = (target: ThreadListScrollTarget): boolean => {
    const metrics = readMetrics();
    if (!metrics) return true;
    switch (target.tag) {
      case 'bottom':
        return metrics.distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
      case 'top':
        return metrics.scrollOffset <= NEAR_BOTTOM_THRESHOLD;
      case 'id':
      case 'index': {
        const targetIndex = resolveTargetIndex(target);
        if (targetIndex < 0) return true; // target gone, nothing to verify
        const currentIndex = getCurrentIndex();
        // Consider correct if the target is within a reasonable range of
        // the current viewport (within ±5 items accounts for alignment).
        return Math.abs(currentIndex - targetIndex) <= 5;
      }
    }
  };

  const emitScrollState = (isScrollingDown: boolean) => {
    if (!props.onScrollStateChange) return;
    const metrics = readMetrics();
    if (!metrics) return;
    props.onScrollStateChange({
      didInitialScroll: didInitialScroll(),
      isNearBottom: metrics.distanceFromBottom <= NEAR_BOTTOM_THRESHOLD,
      isScrollingDown,
      distanceFromTop: metrics.distanceFromTop,
      distanceFromBottom: metrics.distanceFromBottom,
      viewportSize: metrics.viewportSize,
    });
  };

  /** Mark the initial scroll as complete and broadcast the scroll state. */
  const completeInitialScroll = () => {
    setDidInitialScroll(true);
    emitScrollState(false);
  };

  const createNavigation = (): ThreadListNavigation => ({
    scrollTo: (target) => scrollToTarget(target),

    scrollToIndex: (index, opts = {}) =>
      scrollToTarget({ tag: 'index', index, align: opts.align }),

    scrollByDelta: (delta, opts = {}) => {
      const current = getCurrentIndex();
      if (current < 0) return false;
      return scrollToTarget({
        tag: 'index',
        index: current + delta,
        align: opts.align,
      });
    },

    scrollToTop: (align = 'start') => scrollToTarget({ tag: 'top', align }),

    scrollToBottom: (align = 'end') => scrollToTarget({ tag: 'bottom', align }),

    scrollToId: (id, opts = {}) =>
      scrollToTarget({ tag: 'id', id, align: opts.align }),

    navigatePrevious: () => {
      const current = getCurrentIndex();
      if (current <= 0) return false;
      return scrollToTarget({ tag: 'index', index: current - 1 });
    },

    navigateNext: () => {
      const current = getCurrentIndex();
      if (current < 0) return false;
      return scrollToTarget({ tag: 'index', index: current + 1 });
    },

    isNearBottom,

    markUserIntent: scrollIntent.markUserIntent,
  });

  function scrollOnMount() {
    if (initialScrollStarted) return;
    initialScrollStarted = true;

    const target = props.initialScrollTarget ?? DEFAULT_INITIAL_SCROLL_TARGET;
    initialScrollTarget = target;

    console.debug('ThreadList: scrollOnMount', {
      target,
      itemCount: props.keys().length,
      ...readMetrics(),
    });

    const didScroll = scrollToTarget(target);

    if (!didScroll) {
      // Empty list or target not found — nothing to verify.
      console.debug(
        'ThreadList: target not resolvable, completing immediately'
      );
      completeInitialScroll();
      return;
    }

    // If no actual scrolling was needed (content fits in viewport),
    // the scroll-end debounce will never fire. Use a RAF to detect this
    // case and finalize immediately.
    requestAnimationFrame(() => {
      if (didInitialScroll()) return;
      if (isScrollPositionCorrect(target)) {
        console.debug(
          'ThreadList: position already correct (RAF fallback), completing'
        );
        completeInitialScroll();
      }
    });
  }

  const handleScrollEnd = () => {
    if (didInitialScroll()) return;
    if (!scrollRef) return;

    if (isScrollPositionCorrect(initialScrollTarget)) {
      console.debug('ThreadList: scroll settled at position, completing', {
        ...readMetrics(),
      });
      completeInitialScroll();
      return;
    }

    if (!initialScrollRetried) {
      initialScrollRetried = true;
      console.debug('ThreadList: initial scroll missed target, retrying', {
        target: initialScrollTarget,
        ...readMetrics(),
      });
      requestAnimationFrame(() => {
        const retryScrolled = scrollToTarget(initialScrollTarget);
        if (!retryScrolled) {
          // Target disappeared between mount and retry — finalize now since
          // no scroll events will fire to trigger another settle.
          completeInitialScroll();
        }
      });
      return;
    }
    console.warn(
      'ThreadList: initial scroll did not reach target after retry',
      {
        target: initialScrollTarget,
        ...readMetrics(),
      }
    );
    completeInitialScroll();
  };

  const scheduleScrollEnd = () => {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      scrollEndTimer = undefined;
      handleScrollEnd();
    }, SCROLL_END_DEBOUNCE_MS);
  };

  const handleScroll = () => {
    const metrics = readMetrics();
    if (!metrics) {
      console.warn(
        'Channel.ThreadList: handle scroll but the scroll element is undefined'
      );
      return;
    }

    const nearTop = metrics.distanceFromTop <= NEAR_TOP_THRESHOLD;
    const nearBottom = metrics.distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;

    setIsNearBottom(nearBottom);
    let nextIsScrollingDown = false;

    if (previousScrollOffset !== undefined) {
      const delta = metrics.scrollOffset - previousScrollOffset;
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
    previousScrollOffset = metrics.scrollOffset;
    emitScrollState(nextIsScrollingDown);

    if (!didInitialScroll()) {
      // Until the initial scroll settles, treat scroll events only as a
      // signal that scrolling is happening (so the debounce can finalize).
      scheduleScrollEnd();
      return;
    }

    // Only trigger pagination callbacks when the user is actively
    // interacting with the scroll surface. This prevents synthetic
    // scroll events from the virtualizer (content resizes, layout
    // reflows, anchor adjustments) from incorrectly loading more pages.
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

  onMount(() => {
    if (props.onNavigationReady) {
      props.onNavigationReady(createNavigation());
    }
    resetInitialScroll();
    // Defer until the scroll element is laid out and the virtualizer has a
    // first measurement pass, otherwise scrollToIndex/scrollToEnd has nothing
    // to scroll to.
    requestAnimationFrame(() => scrollOnMount());
  });

  onCleanup(() => {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
  });

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
        onScroll={handleScroll}
        style={{
          width: '100%',
          'overflow-y': 'auto',
          'overflow-anchor': 'none',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
        }}
      >
        {/* Pushes content to the bottom when it is shorter than the viewport.
            When content overflows, this collapses to 0 so the virtualized
            content starts at scroll offset 0 (scrollMargin stays 0). */}
        <div style="flex-grow: 1" />
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          <For each={virtualizer.getVirtualItems()}>
            {(virtualItem) => (
              <div
                data-index={virtualItem.index}
                ref={(el) => virtualizer.measureElement(el)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {props.children({ id: String(virtualItem.key) })}
              </div>
            )}
          </For>
        </div>
      </div>
      <CustomScrollbar scrollContainer={scrollEl} />
    </>
  );
}
