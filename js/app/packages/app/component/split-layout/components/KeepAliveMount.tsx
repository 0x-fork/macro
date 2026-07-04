import type { BlockName } from '@core/block';
import { LoadingBlock } from '@core/component/LoadingBlock';
import {
  blocks as BLOCK_REGISTRY,
  resolveBlockAlias,
} from '@core/constant/allBlocks';
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
import type { SplitMount } from '../layoutManager';
import { KeepAliveVisibilityProvider } from './keep-alive-visibility';

/**
 * Live trees retained per panel: the active mount plus recently viewed ones.
 * Each parked tree keeps its queries observed (staying fresh) and its DOM
 * built, so revisits reattach instead of rebuilding.
 */
const KEEP_ALIVE_CAP = 8;

type BlockMount = Extract<SplitMount, { kind: 'block' }>;

type CacheEntry = {
  container: HTMLDivElement;
  dispose: () => void;
  lastUsed: number;
  /** Gates the tree's portals/shared-state writes; see useKeepAliveVisible. */
  setActive: (active: boolean) => void;
};

function keepAliveKey(mount: BlockMount): string {
  return `${mount.type}:${mount.id}`;
}

function isKeepAliveMount(mount: SplitMount): mount is BlockMount {
  if (mount.kind !== 'block') return false;
  const resolved = resolveBlockAlias(mount.type as BlockName);
  return !!BLOCK_REGISTRY[resolved]?.keepAlive;
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
export function KeepAliveMount(props: { mount: SplitMount }) {
  const owner = getOwner();
  const cache = new Map<string, CacheEntry>();
  let hostEl: HTMLDivElement | undefined;
  let activeEntry: CacheEntry | undefined;

  // Starts empty so a brand-new split also paints its shimmer before the
  // first tree builds — creating a split was the one path that still did
  // its full mount synchronously inside the click task.
  const [displayedMount, setDisplayedMount] = createSignal<SplitMount>();
  const swapPending = () => displayedMount() !== props.mount;

  let swapGeneration = 0;
  let cleanedUp = false;
  createEffect(() => {
    const next = props.mount;
    const current = untrack(displayedMount);
    if (next === current) return;
    if (current && !shouldDeferSwap(current, next)) {
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
    while (cache.size > KEEP_ALIVE_CAP) {
      let oldest: [string, CacheEntry] | undefined;
      for (const candidate of cache.entries()) {
        if (candidate[0] === activeKey) continue;
        if (!oldest || candidate[1].lastUsed < oldest[1].lastUsed) {
          oldest = candidate;
        }
      }
      if (!oldest) return;
      oldest[1].container.remove();
      oldest[1].dispose();
      cache.delete(oldest[0]);
    }
  };

  const showKeepAlive = (mount: BlockMount) => {
    const key = keepAliveKey(mount);
    let entry = cache.get(key);
    if (!entry) {
      const container = document.createElement('div');
      container.style.display = 'contents';
      let dispose = () => {};
      const [active, setActive] = createSignal(false);
      createRoot((d) => {
        dispose = d;
        insert(
          container,
          <KeepAliveVisibilityProvider value={active}>
            {mount.element()}
          </KeepAliveVisibilityProvider>
        );
      }, owner);
      entry = { container, dispose, lastUsed: 0, setActive };
      cache.set(key, entry);
    }
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
