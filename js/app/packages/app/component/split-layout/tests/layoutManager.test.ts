import type { BlockOrchestrator } from '@core/orchestrator';
import { createRoot } from 'solid-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSplitLayout, type SplitContent } from '../layoutManager';

vi.mock('../componentRegistry.tsx', () => ({
  resolveComponent: vi.fn((id: string, params: Record<string, string>) => ({
    type: 'mock-component',
    id,
    params,
  })),
}));

vi.mock('zod', () => ({ z: undefined }));

beforeAll(() => {
  // Mock window.matchMedia for tests
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

describe('layoutManager', () => {
  describe('reconciler', () => {
    it('should reconcile between current state and url changes', () => {
      createRoot((dispose) => {
        const manager = createSplitLayout(createMockOrchestrator(), [
          { type: 'component', id: 'unified-list' },
          { type: 'md', id: 'test-md' },
          { type: 'component', id: 'unified-list' },
        ]);

        expect(manager.splits()).toHaveLength(3);

        const markdownSplitIdBefore = manager.splits()[1].id;

        manager.reconcile([
          { type: 'md', id: 'test-md' },
          { type: 'component', id: 'unified-list' },
          { type: 'component', id: 'unified-list' },
        ]);

        const markdownSplitIdAfter = manager.splits()[0].id;

        expect(manager.splits()).toHaveLength(3);
        expect(markdownSplitIdBefore).toBe(markdownSplitIdAfter);

        dispose();
      });
    });

    it('should reconcile between block -> component', () => {
      createRoot((dispose) => {
        const manager = createSplitLayout(createMockOrchestrator(), [
          { type: 'md', id: 'test-md' },
        ]);

        manager.reconcile([{ type: 'component', id: 'unified-list' }]);

        expect(manager.splits()).toHaveLength(1);
        expect(manager.splits()[0].content.type).toBe('component');

        dispose();
      });
    });

    it('should preserve ordering when reconciling back to previous state (browser back)', () => {
      createRoot((dispose) => {
        const ORIGINAL_SPLITS = [
          { type: 'md', id: 'test-md-0' },
          { type: 'md', id: 'test-md-1' },
          { type: 'md', id: 'test-md-2' },
        ] satisfies SplitContent[];

        const NEW_SPLITS = [
          { type: 'md', id: 'test-md-0' },
          { type: 'md', id: 'test-md-3' },
          { type: 'md', id: 'test-md-2' },
        ] satisfies SplitContent[];

        const manager = createSplitLayout(
          createMockOrchestrator(),
          ORIGINAL_SPLITS
        );
        expect(manager.splits()).toHaveLength(3);
        expect(manager.splits().map((s) => s.content)).toEqual(ORIGINAL_SPLITS);

        manager.reconcile(NEW_SPLITS);
        expect(manager.splits()).toHaveLength(3);
        expect(manager.splits().map((s) => s.content)).toEqual(NEW_SPLITS);

        manager.reconcile(ORIGINAL_SPLITS);

        expect(manager.splits()).toHaveLength(3);
        expect(manager.splits().map((s) => s.content)).toEqual(ORIGINAL_SPLITS);

        dispose();
      });
    });
  });

  describe('replaceAllSplits (open full screen)', () => {
    it('collapses several splits then restores the whole layout on back', () => {
      createRoot((dispose) => {
        const ORIGINAL = [
          { type: 'md', id: 'test-md-0' },
          { type: 'md', id: 'test-md-1' },
          { type: 'md', id: 'test-md-2' },
        ] satisfies SplitContent[];

        const manager = createSplitLayout(createMockOrchestrator(), ORIGINAL);
        expect(manager.splits()).toHaveLength(3);

        // Make the middle split active (the one the user opened from).
        const activeContentId = manager.splits()[1].content.id;
        manager.activateSplit(manager.splits()[1].id);

        manager.replaceAllSplits({ type: 'md', id: 'full-screen-doc' });

        // Collapsed to a single full-screen split.
        expect(manager.splits()).toHaveLength(1);
        expect(manager.splits()[0].content).toMatchObject({
          type: 'md',
          id: 'full-screen-doc',
        });

        const survivor = manager.getSplit(manager.splits()[0].id)!;
        expect(survivor.canGoBack()).toBe(true);

        survivor.goBack();

        // The original 3-split layout is rebuilt, with the same active split.
        expect(manager.splits()).toHaveLength(3);
        expect(manager.splits().map((s) => s.content)).toEqual(ORIGINAL);
        expect(manager.activeSplitId()).toBe(manager.splits()[1].id);
        expect(manager.splits()[1].content.id).toBe(activeContentId);

        dispose();
      });
    });

    it('discards the layout snapshot once the surviving split navigates away', () => {
      createRoot((dispose) => {
        const manager = createSplitLayout(createMockOrchestrator(), [
          { type: 'md', id: 'test-md-0' },
          { type: 'md', id: 'test-md-1' },
        ]);

        manager.replaceAllSplits({ type: 'md', id: 'full-screen-doc' });
        expect(manager.splits()).toHaveLength(1);

        // Navigate the surviving split elsewhere without pressing back.
        manager
          .getSplit(manager.splits()[0].id)!
          .replace({ next: { type: 'md', id: 'another-doc' } });

        // Back walks this split's own history, not the stale 2-split layout.
        manager.getSplit(manager.splits()[0].id)!.goBack();
        expect(manager.splits()).toHaveLength(1);
        expect(manager.splits()[0].content).toMatchObject({
          type: 'md',
          id: 'full-screen-doc',
        });

        // A further back must not resurface the original two-split layout.
        manager.getSplit(manager.splits()[0].id)!.goBack();
        expect(manager.splits()).toHaveLength(1);

        dispose();
      });
    });

    it('opens in place for a single split and back returns to the prior content', () => {
      createRoot((dispose) => {
        const manager = createSplitLayout(createMockOrchestrator(), [
          { type: 'md', id: 'origin-doc' },
        ]);
        const splitId = manager.splits()[0].id;

        manager.replaceAllSplits({ type: 'md', id: 'full-screen-doc' });

        // Same split, content pushed onto its existing history.
        expect(manager.splits()).toHaveLength(1);
        expect(manager.splits()[0].id).toBe(splitId);
        expect(manager.splits()[0].content).toMatchObject({
          type: 'md',
          id: 'full-screen-doc',
        });

        const handle = manager.getSplit(splitId)!;
        expect(handle.canGoBack()).toBe(true);
        handle.goBack();

        expect(manager.splits()).toHaveLength(1);
        expect(manager.splits()[0].content).toMatchObject({
          type: 'md',
          id: 'origin-doc',
        });

        dispose();
      });
    });
  });
});
