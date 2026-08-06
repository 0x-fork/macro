import type { BlockOrchestrator } from '@core/orchestrator';
import { createRoot } from 'solid-js';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createSplitLayout, type SplitId } from '../layoutManager';
import { restorePreviewPairs } from '../layoutUrlSync';
import { createSplitFocusTracker } from '../splitFocusTracker';

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

function createPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.tabIndex = -1;
  document.body.appendChild(panel);
  return panel;
}

/** Covers the tracker's Insert focus, debounced by 40ms. */
const FOCUS_DEBOUNCE_MS = 50;

/**
 * Reproduce the fresh-load wiring of SplitLayoutContainer: the manager comes
 * up from URL contents (last split active), Preview Pairs restore, and only
 * then does the focus tracker mount and process the trailing Insert event.
 */
function mountFreshLoad(options: { withPreviewPair: boolean }) {
  return createRoot((dispose) => {
    const manager = createSplitLayout(createMockOrchestrator(), [
      { type: 'component', id: 'inbox' },
      { type: 'md', id: 'doc-1' },
    ]);
    if (options.withPreviewPair) {
      restorePreviewPairs(manager, [{ controllerIndex: 0 }]);
    }

    const panelRefs = new Map<SplitId, HTMLDivElement>(
      manager.splits().map((split) => [split.id, createPanel()])
    );

    createSplitFocusTracker({
      splitManager: manager,
      panelRefs,
      splits: manager.splits,
    });

    return { dispose, manager, panelRefs };
  });
}

describe('createSplitFocusTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('moves fresh-load focus to the Controller when the last URL split is a Preview Pair Viewer', () => {
    const { dispose, manager, panelRefs } = mountFreshLoad({
      withPreviewPair: true,
    });
    const [controller, viewer] = manager.splits();

    vi.advanceTimersByTime(FOCUS_DEBOUNCE_MS);

    expect(manager.controllerOf(viewer.id)).toBe(controller.id);
    expect(document.activeElement).toBe(panelRefs.get(controller.id));
    expect(manager.activeSplitId()).toBe(controller.id);

    dispose();
  });

  it('cancels pending debounced focus when its owner is disposed', () => {
    const { dispose } = mountFreshLoad({ withPreviewPair: true });

    dispose();
    vi.advanceTimersByTime(FOCUS_DEBOUNCE_MS);

    expect(document.activeElement).toBe(document.body);
  });

  it('keeps fresh-load focus on the last split when it is not a Viewer', () => {
    const { dispose, manager, panelRefs } = mountFreshLoad({
      withPreviewPair: false,
    });
    const [, last] = manager.splits();

    vi.advanceTimersByTime(FOCUS_DEBOUNCE_MS);

    expect(document.activeElement).toBe(panelRefs.get(last.id));
    expect(manager.activeSplitId()).toBe(last.id);

    dispose();
  });

  it('moves DOM focus when an already-mounted split is activated', async () => {
    let dispose = () => {};
    let manager: ReturnType<typeof createSplitLayout>;
    let panelRefs: Map<SplitId, HTMLDivElement>;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      manager = createSplitLayout(createMockOrchestrator(), [
        { type: 'component', id: 'inbox' },
        { type: 'chat', id: 'chat-1' },
      ]);
      panelRefs = new Map(
        manager.splits().map((split) => [split.id, createPanel()])
      );
      createSplitFocusTracker({
        splitManager: manager,
        panelRefs,
        splits: manager.splits,
      });
    });

    await Promise.resolve();

    const [inbox, chat] = manager!.splits();
    manager!.activateSplit(inbox.id);
    await Promise.resolve();
    manager!.activateSplit(chat.id);
    await Promise.resolve();

    expect(document.activeElement).toBe(panelRefs!.get(chat.id));
    dispose();
  });

  it('restores a split child during an immediate split switch', async () => {
    let dispose = () => {};
    let manager: ReturnType<typeof createSplitLayout>;
    let panelRefs: Map<SplitId, HTMLDivElement>;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      manager = createSplitLayout(createMockOrchestrator(), [
        { type: 'component', id: 'inbox' },
        { type: 'channel', id: 'channel-1' },
      ]);
      panelRefs = new Map(
        manager.splits().map((split) => [split.id, createPanel()])
      );
      createSplitFocusTracker({
        splitManager: manager,
        panelRefs,
        splits: manager.splits,
      });
    });

    await Promise.resolve();

    const [inbox, channel] = manager!.splits();
    for (const split of [inbox, channel]) {
      const panel = panelRefs!.get(split.id);
      panel?.setAttribute('data-split-container', '');
      panel?.setAttribute('data-split-id', split.id);
    }
    const messageList = document.createElement('div');
    messageList.tabIndex = -1;
    panelRefs!.get(channel.id)?.append(messageList);
    messageList.focus();

    manager!.activateSplit(inbox.id);
    await Promise.resolve();
    manager!.activateSplit(channel.id);
    await Promise.resolve();

    expect(document.activeElement).toBe(messageList);
    dispose();
  });

  it('focuses a navigable scope instead of stranding focus on the split shell', async () => {
    let dispose = () => {};
    let manager: ReturnType<typeof createSplitLayout>;
    let panelRefs: Map<SplitId, HTMLDivElement>;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      manager = createSplitLayout(createMockOrchestrator(), [
        { type: 'component', id: 'inbox' },
        { type: 'channel', id: 'channel-1' },
      ]);
      panelRefs = new Map(
        manager.splits().map((split) => [split.id, createPanel()])
      );
      createSplitFocusTracker({
        splitManager: manager,
        panelRefs,
        splits: manager.splits,
      });
    });

    await Promise.resolve();

    const [inbox, channel] = manager!.splits();
    const navigationRegion = document.createElement('div');
    navigationRegion.tabIndex = -1;
    navigationRegion.setAttribute('data-hotkey-scope', 'channel-messages');
    panelRefs!.get(channel.id)?.append(navigationRegion);

    manager!.activateSplit(inbox.id);
    await Promise.resolve();
    manager!.activateSplit(channel.id);
    await Promise.resolve();

    expect(document.activeElement).toBe(navigationRegion);
    dispose();
  });
});
