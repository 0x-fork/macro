import { CustomScrollbar } from '@core/component/CustomScrollbar';
import {
  createScrollIntentTracker,
  type ScrollDirection,
} from '@core/util/scroll-intent';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { type Accessor, createSignal, For, type JSX, onMount } from 'solid-js';
import { NEAR_BOTTOM_THRESHOLD } from './constants';

/**
 * Estimated row height (px) for not-yet-measured messages. Real heights are
 * measured per row; end-anchoring keeps the bottom pinned as they settle, so
 * this only affects how much is rendered before the first measurement pass.
 */
const BASE_ITEM_SIZE = 64;
/** Rows rendered beyond the viewport on each side. */
const OVERSCAN = 6;

const NEAR_TOP_THRESHOLD = 800;
const EXPLICIT_SCROLL_DOWN_TRIGGER_DISTANCE = 64;

/**
 * Alignment vocabulary exposed to callers. Kept identical to the previous
 * (virtua-based) contract — including `'nearest'` — so navigation callers are
 * unaffected. Mapped to TanStack's vocabulary internally.
 */
type ScrollAlignment = 'start' | 'center' | 'end' | 'nearest';
type VirtualAlign = 'start' | 'center' | 'end' | 'auto';

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
  /**
   * Retained for API compatibility. End-anchoring (`anchorTo: 'end'`) now
   * preserves the viewport when older pages are prepended, which is what these
   * props previously drove, so they no longer need to be wired through.
   */
  shift?: Accessor<boolean>;
  prepend?: Accessor<boolean>;
};

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

function toVirtualAlign(align: ScrollAlignment): VirtualAlign {
  // TanStack's `'auto'` matches virtua's `'nearest'`: only scroll if the item
  // isn't already fully visible.
  return align === 'nearest' ? 'auto' : align;
}

export function ThreadList(props: ThreadListProps) {
  let scrollRef: HTMLDivElement | undefined;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement>();
  const [isNearBottom, setIsNearBottom] = createSignal(true);
  const [didInitialScroll, setDidInitialScroll] = createSignal(false);

  const scrollIntent = createScrollIntentTracker();

  // Edge-trigger latches so a pagination callback fires once per entry into
  // the near-top / near-bottom zone (and re-arms on leaving it).
  let nearTopFired = false;
  let nearBottomFired = false;
  // Accumulated downward scroll distance, used to drive the scroll-to-bottom
  // overlay (matches the previous behavior).
  let previousScrollOffset: number | undefined;
  let explicitScrollDownDistance = 0;

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return props.keys().length;
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => BASE_ITEM_SIZE,
    getItemKey: (index) => props.keys()[index] ?? index,
    overscan: OVERSCAN,
    // The conversation rests at its newest message. End-anchoring is what
    // makes the channel open at the bottom *without* the old "render mid-list
    // then jump" flicker: as rows are measured (markdown, attachments, thread
    // replies, images that load in) the bottom stays pinned instead of being
    // left behind at the estimated offset. It also holds the viewport steady
    // when older pages are prepended (replacing the `shift` prop) and keeps the
    // tail of the last message in view when it grows (reactions / reply box).
    anchorTo: 'end',
    // Treat "within NEAR_BOTTOM_THRESHOLD px of the end" as being at the end,
    // matching `isNearBottom` so end-pinning engages at the same point the rest
    // of the UI considers you to be at the bottom.
    scrollEndThreshold: NEAR_BOTTOM_THRESHOLD,
  });

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
      case 'id':
        return keys.indexOf(target.id);
    }
  };

  const scrollToTarget = (target: ThreadListScrollTarget): boolean => {
    if (target.tag === 'bottom') {
      // `scrollToEnd` aligns the final item to the end and cooperates with
      // end-anchoring; it also handles the empty-list case.
      virtualizer.scrollToEnd();
      return true;
    }
    const index = resolveTargetIndex(target);
    if (index < 0) return false;
    virtualizer.scrollToIndex(index, {
      align: toVirtualAlign(getTargetAlign(target)),
    });
    return true;
  };

  const getCurrentIndex = (): number => {
    const itemCount = props.keys().length;
    if (!itemCount) return -1;
    const item = virtualizer.getVirtualItemForOffset(
      virtualizer.scrollOffset ?? 0
    );
    return item ? clamp(item.index, 0, itemCount - 1) : -1;
  };

  const navigation: ThreadListNavigation = {
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
  };

  /** Read live scroll geometry from the DOM (robust to virtualizer update
   *  ordering). `scrollHeight` already accounts for the bottom-pin spacer. */
  const measureMetrics = () => {
    const el = scrollRef;
    if (!el) {
      return { distanceFromTop: 0, distanceFromBottom: 0, viewportSize: 0 };
    }
    return {
      distanceFromTop: el.scrollTop,
      distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      viewportSize: el.clientHeight,
    };
  };

  const emitScrollState = (isScrollingDown: boolean) => {
    const { distanceFromTop, distanceFromBottom, viewportSize } =
      measureMetrics();
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
    setIsNearBottom(nearBottom);
    props.onScrollStateChange?.({
      didInitialScroll: didInitialScroll(),
      isNearBottom: nearBottom,
      isScrollingDown,
      distanceFromTop,
      distanceFromBottom,
      viewportSize,
    });
  };

  const handleScroll = () => {
    const { distanceFromTop, distanceFromBottom } = measureMetrics();
    const nearTop = distanceFromTop <= NEAR_TOP_THRESHOLD;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;

    let nextIsScrollingDown = false;
    if (previousScrollOffset !== undefined) {
      const delta = distanceFromTop - previousScrollOffset;
      // Accumulate downward distance only during user interaction. Synthetic
      // scrolls (anchor adjustments, measurement reflows) must not count.
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
    previousScrollOffset = distanceFromTop;

    emitScrollState(nextIsScrollingDown);

    if (!didInitialScroll()) return;

    // Only paginate on genuine user scrolling — anchor adjustments and
    // measurement reflows must not trigger page loads.
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
    props.onNavigationReady?.(navigation);

    const target = props.initialScrollTarget ?? DEFAULT_INITIAL_SCROLL_TARGET;
    // Land on the initial target before the first paint. With `anchorTo: 'end'`
    // the bottom then stays pinned as rows are measured, so there is no visible
    // convergence from the estimated position to the real one.
    scrollToTarget(target);

    requestAnimationFrame(() => {
      if (didInitialScroll()) return;
      // Re-assert once after the first layout pass, then signal readiness to
      // dependent UI (scroll-to-bottom overlay, target-message controller).
      scrollToTarget(target);
      setDidInitialScroll(true);
      emitScrollState(false);
    });
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
        <div
          style={{
            position: 'relative',
            width: '100%',
            // Pins a short conversation to the bottom; collapses to 0 once the
            // content overflows the viewport (then normal scrolling applies).
            'margin-top': 'auto',
            'flex-shrink': 0,
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          <For each={virtualizer.getVirtualItems()}>
            {(virtualRow) => (
              <div
                data-index={virtualRow.index}
                ref={(el) =>
                  queueMicrotask(() => virtualizer.measureElement(el))
                }
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {props.children({ id: String(virtualRow.key) })}
              </div>
            )}
          </For>
        </div>
      </div>
      <CustomScrollbar scrollContainer={scrollEl} />
    </>
  );
}
