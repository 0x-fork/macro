import type { BlockOrchestrator } from '@core/orchestrator';
import {
  createMemoryHistory,
  MemoryRouter,
  Route,
  type RouteSectionProps,
} from '@solidjs/router';
import { render } from 'solid-js/web';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createSplitLayout,
  type SplitHandle,
  type SplitManager,
} from '../layoutManager';
import { decodePairs } from '../layoutUtils';
import { createLayoutUrlSync } from '../url-sync';

vi.mock('../componentRegistry', () => ({
  resolveComponent: vi.fn((id: string, params: Record<string, string>) => ({
    type: 'mock-component',
    id,
    params,
  })),
}));

vi.mock('@core/constant/allBlocks', () => ({
  isBlockAlias: vi.fn(() => false),
  resolveBlockAlias: vi.fn((type: string) => type),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

function createMockOrchestrator(): BlockOrchestrator {
  return {
    createBlockInstance: vi.fn((_type, id, _splitId) => ({
      node: { type: 'mock-node', id },
      detach: vi.fn(),
      dispose: vi.fn(),
    })),
  } as unknown as BlockOrchestrator;
}

/**
 * Mounts a minimal split layout inside a memory router, wired up with the
 * same URL sync logic as SplitLayoutContainer. Returns the router's history
 * (a stand-in for the browser history stack) and the split manager.
 */
function mountLayoutWithRouter(initialUrl: string) {
  const history = createMemoryHistory();
  history.set({ value: initialUrl });

  let manager!: SplitManager;

  const LayoutRoute = (props: RouteSectionProps) => {
    const pairs = () => props.params.splits?.split('/') ?? [];
    const decodedPairs = () => decodePairs(pairs());
    manager = createSplitLayout(createMockOrchestrator(), decodedPairs());
    createLayoutUrlSync(manager, pairs, decodedPairs);
    return null;
  };

  const container = document.createElement('div');
  document.body.appendChild(container);

  const dispose = render(
    () => (
      <MemoryRouter history={history}>
        <Route path="/*splits" component={LayoutRoute} />
      </MemoryRouter>
    ),
    container
  );

  return {
    history,
    manager: () => manager,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitForUrl(history: { get: () => string }, url: string) {
  await vi.waitFor(() => expect(history.get()).toBe(url));
}

describe('split layout url sync', () => {
  it('replaces the loading entry in browser history when creation resolves', async () => {
    const { history, manager, dispose } =
      mountLayoutWithRouter('/component/inbox');
    await flush();

    // Launcher flow: open a loading pane while the create call is in flight
    const split = manager().openWithSplit(
      { type: 'component', id: 'loading' },
      { referredFrom: 'launcher' }
    ) as SplitHandle;
    await waitForUrl(history, '/component/loading');

    // ...then swap it for the created entity
    split.replace({
      next: { type: 'md', id: 'new-doc' },
      mergeHistory: true,
      referredFrom: 'launcher',
    });
    await waitForUrl(history, '/md/new-doc');

    // Browser back must skip the transient loading entry
    history.go(-1);
    await flush();
    expect(history.get()).toBe('/component/inbox');

    dispose();
  });

  it('does not leave the loading entry in browser history when creation fails', async () => {
    const { history, manager, dispose } =
      mountLayoutWithRouter('/component/inbox');
    await flush();

    const split = manager().openWithSplit(
      { type: 'component', id: 'loading' },
      { referredFrom: 'launcher' }
    ) as SplitHandle;
    await waitForUrl(history, '/component/loading');

    // Launcher flow when createFn fails: back out of the loading pane
    split.goBack();
    await waitForUrl(history, '/component/inbox');

    // Browser back must not land on the loading entry
    history.go(-1);
    await flush();
    expect(history.get()).not.toBe('/component/loading');

    dispose();
  });
});
