import { isListViewID, LIST_VIEW_ID } from '@app/constants/list-views';
import type { BlockName } from '@core/block';
import { LoadingBlock } from '@core/component/LoadingBlock';
import {
  blocks as BLOCK_REGISTRY,
  resolveBlockAlias,
} from '@core/constant/allBlocks';
import { useUserContext } from '@core/context/user';
import { isMobile } from '@core/mobile/isMobile';
import {
  createEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
import { Dynamic, insert } from 'solid-js/web';
import { createComponentMount, type SplitMount } from '../layoutManager';
import {
  KeepAliveContentKeyProvider,
  KeepAliveVisibilityProvider,
} from './keep-alive-visibility';

/**
 * Live block trees retained per panel: the active mount plus recently
 * viewed ones. Each parked tree keeps its queries observed (staying fresh)
 * and its DOM built, so revisits reattach instead of rebuilding. List-view
 * component trees are exempt from this cap (see evictBeyondCap).
 */
const KEEP_ALIVE_CAP = 8;

const BLOCK_KEY_PREFIX = 'block:';

type CacheEntry = {
  container: HTMLDivElement;
  dispose: () => void;
  lastUsed: number;
  /** Gates the tree's portals/shared-state writes; see useKeepAliveVisible. */
  setActive: (active: boolean) => void;
};

function keepAliveKey(mount: SplitMount): string {
  if (mount.kind === 'block') {
    return `${BLOCK_KEY_PREFIX}${mount.type}:${mount.id}`;
  }
  // Param variants of a view must not share a parked tree — the element
  // was resolved with the params baked in.
  const params = mount.params ? JSON.stringify(mount.params) : '';
  return `component:${mount.name}:${params}`;
}

function isKeepAliveMount(mount: SplitMount): boolean {
  if (mount.kind === 'block') {
    const resolved = resolveBlockAlias(mount.type as BlockName);
    return !!BLOCK_REGISTRY[resolved]?.keepAlive;
  }
  // List views park their whole tree (own per-view soup state included, see
  // getSoupForView) so switching views reattaches rows, scroll position,
  // and focus in one frame instead of rebuilding the list. Parameterized
  // variants (command-menu searches, param'd documents views) are
  // excluded: they are unbounded in number and share one per-view-id soup
  // state, so parking them would both leak live trees and let multiple
  // live writers fight over the visible rows.
  const hasParams = mount.params && Object.keys(mount.params).length > 0;
  return isListViewID(mount.name) && !hasParams;
}

/**
 * Disposing a fully rendered list view and mounting the next view's shell
 * is the expensive part of a mount swap. Doing it synchronously inside the
 * click task blocks paint — the clicked nav item doesn't even highlight
 * until the whole teardown+mount completes. Swaps involving a 'component'
 * mount (the soup list views) are therefore deferred past the next paint;
 * block-to-block swaps (e.g. j/k between keep-alive emails) stay
 * synchronous because reattaching a parked tree is already one cheap frame.
 */
function shouldDeferSwap(prev: SplitMount, next: SplitMount): boolean {
  return prev.kind === 'component' || next.kind === 'component';
}

/**
 * Renders a split's mount, keeping an LRU of recently viewed keep-alive
 * blocks (see `defineBlock`'s `keepAlive` flag) alive in detached
 * containers instead of disposing them on navigation. Navigating between
 * emails with j/k previously destroyed and rebuilt the whole block tree —
 * orchestrator instance, load pipeline, Suspense boundaries, per-message
 * shadow DOMs — on every switch; with keep-alive, revisits reattach the
 * existing tree in one frame.
 *
 * Containers are rendered into roots created under this component's owner,
 * so context (split panel, query client, theme, router) resolves normally.
 * Detached trees stay subscribed to their queries — which also keeps them
 * fresh — and are disposed on LRU eviction or panel teardown.
 *
 * The displayed mount intentionally lags `props.mount` by one frame for
 * expensive swaps (see shouldDeferSwap): the click task only paints a
 * shimmer overlay and the nav's active state, and the teardown+mount runs
 * right after that paint.
 */
/**
 * Sidebar list views pre-built at idle after auth so the FIRST visit of a
 * session reattaches a warm tree instead of building cold. Ordered by how
 * likely the user is to click them next.
 */
const WARM_LIST_VIEWS = [
  LIST_VIEW_ID.inbox,
  LIST_VIEW_ID.mail,
  LIST_VIEW_ID.documents,
  LIST_VIEW_ID.agents,
  LIST_VIEW_ID.tasks,
] as const;

const WARM_START_DELAY_MS = 4_000;

export function KeepAliveMount(props: {
  mount: SplitMount;
  /** Warm-up only runs for the active panel to bound total tree cost. */
  warmListViews?: () => boolean;
}) {
  const owner = getOwner();
  const cache = new Map<string, CacheEntry>();
  let hostEl: HTMLDivElement | undefined;
  let activeEntry: CacheEntry | undefined;

  // Starts empty so a brand-new split also paints its shimmer before the
  // first tree builds — creating a split was the one path that still did
  // its full mount synchronously inside the click task.
  const [displayedMount, setDisplayedMount] = createSignal<SplitMount>();
  const swapPending = () => displayedMount() !== props.mount;

  // Reattaching an already-parked tree is one cheap synchronous frame —
  // deferring it would only add a shimmer flash. Parked list views and
  // blocks therefore swap in immediately, rows/scroll/focus intact.
  const isParked = (mount: SplitMount) =>
    isKeepAliveMount(mount) && cache.has(keepAliveKey(mount));

  let swapGeneration = 0;
  let cleanedUp = false;
  createEffect(() => {
    const next = props.mount;
    const current = untrack(displayedMount);
    if (next === current) return;
    if (current && (isParked(next) || !shouldDeferSwap(current, next))) {
      setDisplayedMount(next);
      return;
    }
    const generation = ++swapGeneration;
    // rAF alone fires before the frame commits; the nested timeout lands
    // right after the click's paint (nav highlight, active states, the
    // shimmer covering the outgoing content), so the expensive
    // teardown+mount never blocks that feedback. The panel must read as
    // the NEW selection immediately — lingering old content under a new
    // nav highlight feels broken — so the pending frame shows a shimmer,
    // never the outgoing view. Rapid re-navigation supersedes any
    // scheduled swap via the generation counter and always lands on the
    // latest mount.
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (cleanedUp || generation !== swapGeneration) return;
        setDisplayedMount(untrack(() => props.mount));
      }, 0);
    });
  });

  const deactivateCurrent = () => {
    activeEntry?.setActive(false);
    activeEntry = undefined;
  };

  const evictBeyondCap = (activeKey: string) => {
    // Only block trees count against (and are evicted by) the cap:
    // list-view component trees are bounded by the handful of list views
    // and must survive long block-reading sessions so switching back stays
    // instant.
    const blockEntries = () =>
      [...cache.entries()].filter(([key]) => key.startsWith(BLOCK_KEY_PREFIX));
    let entries = blockEntries();
    while (entries.length > KEEP_ALIVE_CAP) {
      let oldest: [string, CacheEntry] | undefined;
      for (const candidate of entries) {
        if (candidate[0] === activeKey) continue;
        if (!oldest || candidate[1].lastUsed < oldest[1].lastUsed) {
          oldest = candidate;
        }
      }
      if (!oldest) return;
      oldest[1].container.remove();
      oldest[1].dispose();
      cache.delete(oldest[0]);
      entries = blockEntries();
    }
  };

  const ensureEntry = (mount: SplitMount): CacheEntry => {
    const key = keepAliveKey(mount);
    let entry = cache.get(key);
    if (!entry) {
      const container = document.createElement('div');
      container.style.display = 'contents';
      let dispose = () => {};
      const [active, setActive] = createSignal(false);
      const contentKey = mount.kind === 'component' ? mount.name : mount.id;
      createRoot((d) => {
        dispose = d;
        insert(
          container,
          <KeepAliveVisibilityProvider value={active}>
            <KeepAliveContentKeyProvider value={contentKey}>
              {mount.element()}
            </KeepAliveContentKeyProvider>
          </KeepAliveVisibilityProvider>
        );
      }, owner);
      entry = { container, dispose, lastUsed: 0, setActive };
      cache.set(key, entry);
    }
    return entry;
  };

  const showKeepAlive = (mount: SplitMount) => {
    const key = keepAliveKey(mount);
    const entry = ensureEntry(mount);
    entry.lastUsed = Date.now();
    if (entry !== activeEntry) {
      deactivateCurrent();
      activeEntry = entry;
      entry.setActive(true);
    }
    if (hostEl && entry.container.parentElement !== hostEl) {
      hostEl.replaceChildren(entry.container);
    }
    evictBeyondCap(key);
  };

  createEffect(() => {
    const mount = displayedMount();
    if (!mount) return;
    if (!isKeepAliveMount(mount)) {
      // A non-keep-alive mount is showing; parked trees must go dormant.
      deactivateCurrent();
      return;
    }
    showKeepAlive(mount);
  });

  // Pre-build the sidebar list views at idle once authenticated, so first
  // visits this session reattach instead of building cold. Trees are
  // created parked (inactive): their entry-state/hotkey/portal integrations
  // all gate on visibility and the content key, and their queries mount and
  // restore from IDB in the background — a fresh page load warms itself.
  const { isAuthenticated } = useUserContext();
  let warmingStarted = false;
  createEffect(() => {
    if (warmingStarted) return;
    if (isMobile()) return; // 5 extra live trees is too heavy for phones.
    if (!props.warmListViews?.()) return;
    if (isAuthenticated() !== true) return;
    warmingStarted = true;

    const queue = [...WARM_LIST_VIEWS];
    const scheduleIdle =
      typeof requestIdleCallback === 'function'
        ? (cb: () => void) =>
            requestIdleCallback(() => cb(), { timeout: 2_000 })
        : (cb: () => void) => setTimeout(cb, 200);
    const warmNext = () => {
      if (cleanedUp) return;
      const next = queue.shift();
      if (!next) return;
      const mount = createComponentMount(next);
      if (!cache.has(keepAliveKey(mount))) {
        ensureEntry(mount);
      }
      scheduleIdle(warmNext);
    };
    setTimeout(() => scheduleIdle(warmNext), WARM_START_DELAY_MS);
  });

  onCleanup(() => {
    cleanedUp = true;
    for (const entry of cache.values()) {
      entry.container.remove();
      entry.dispose();
    }
    cache.clear();
  });

  return (
    <div class="relative size-full min-h-0">
      <Show
        when={displayedMount() && isKeepAliveMount(displayedMount()!)}
        fallback={
          <Show when={displayedMount()}>
            {(mount) => <Dynamic component={mount().element} />}
          </Show>
        }
      >
        <div
          style={{ display: 'contents' }}
          ref={(el) => {
            hostEl = el;
          }}
        />
      </Show>
      <Show when={swapPending()}>
        {/* Hides the outgoing view for the deferred frame: the split must
            look switched the instant it's clicked, showing the incoming
            view's shimmer rather than the old content. The window is one
            frame plus the (cache-served) build, since the incoming view no
            longer defers its own rows render. */}
        <div class="absolute inset-0 z-10 flex flex-col bg-surface">
          <LoadingBlock />
        </div>
      </Show>
    </div>
  );
}
