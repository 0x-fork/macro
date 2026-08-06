import type { SoupRow } from '@app/features/soup/collection';
import type { SplitHandle } from '@components/app/split-layout/layoutManager';
import { batch, createRoot, createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import {
  hasPreviewableSoupRows,
  useSoupPreviewAvailability,
} from './use-soup-preview-availability';

const row = (kind: SoupRow['kind'] = 'entity'): SoupRow =>
  ({ kind, id: kind }) as SoupRow;

const flushEffects = () => Promise.resolve();

const splitHandleStub = (options: { controller: boolean; room?: boolean }) => {
  let controller = options.controller;
  const engagePreview = vi.fn(() => {
    controller = true;
  });
  const disengagePreview = vi.fn(() => {
    controller = false;
  });
  return {
    engagePreview,
    disengagePreview,
    exitPreviewAsUser: () => {
      controller = false;
    },
    handle: {
      isControllerSplit: () => controller,
      isViewerSplit: () => false,
      canEngagePreview: () => options.room ?? true,
      engagePreview,
      disengagePreview,
    } as unknown as SplitHandle,
  };
};

type HarnessOptions = {
  rows?: SoupRow[];
  isLoading?: boolean;
  isFetching?: boolean;
  controller?: boolean;
  room?: boolean;
  onPreviewRestored?: () => void;
};

const createHarness = (initial: HarnessOptions = {}) => {
  const stub = splitHandleStub({
    controller: initial.controller ?? true,
    room: initial.room,
  });
  let dispose!: () => void;
  let setRows!: (rows: SoupRow[]) => void;
  let setLoading!: (loading: boolean) => void;
  let setFetching!: (fetching: boolean) => void;

  createRoot((rootDispose) => {
    dispose = rootDispose;
    const [rows, updateRows] = createSignal(initial.rows ?? [row()]);
    const [isLoading, updateLoading] = createSignal(initial.isLoading ?? false);
    const [isFetching, updateFetching] = createSignal(
      initial.isFetching ?? false
    );
    setRows = updateRows;
    setLoading = updateLoading;
    setFetching = updateFetching;
    useSoupPreviewAvailability({
      rows,
      isLoading,
      isFetching,
      isPlaceholderData: () => false,
      splitHandle: stub.handle,
      onPreviewRestored: initial.onPreviewRestored,
    });
  });

  return {
    engagePreview: stub.engagePreview,
    disengagePreview: stub.disengagePreview,
    exitPreviewAsUser: stub.exitPreviewAsUser,
    dispose,
    setRows,
    setLoading,
    setFetching,
  };
};

describe('Soup preview availability', () => {
  it('requires an entity row', () => {
    expect(
      hasPreviewableSoupRows([row('group-header'), row('load-more')])
    ).toBe(false);
    expect(hasPreviewableSoupRows([row('group-header'), row()])).toBe(true);
  });

  it('disengages when the settled result becomes empty', async () => {
    const harness = createHarness();
    await flushEffects();

    harness.setRows([]);
    await flushEffects();

    expect(harness.disengagePreview).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('waits for loading and fetching to settle', async () => {
    const harness = createHarness({ rows: [], isLoading: true });
    await flushEffects();
    expect(harness.disengagePreview).not.toHaveBeenCalled();

    harness.setLoading(false);
    await flushEffects();
    expect(harness.disengagePreview).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('does not suspend across a fetch that repopulates rows', async () => {
    const harness = createHarness();
    await flushEffects();

    batch(() => {
      harness.setRows([]);
      harness.setFetching(true);
    });
    await flushEffects();
    batch(() => {
      harness.setRows([row()]);
      harness.setFetching(false);
    });
    await flushEffects();

    expect(harness.disengagePreview).not.toHaveBeenCalled();
    expect(harness.engagePreview).not.toHaveBeenCalled();
    harness.dispose();
  });

  it('re-engages when entities return after an empty suspension', async () => {
    const onPreviewRestored = vi.fn();
    const harness = createHarness({ onPreviewRestored });
    await flushEffects();

    harness.setRows([]);
    await flushEffects();
    harness.setRows([row()]);
    await flushEffects();

    expect(harness.engagePreview).toHaveBeenCalledOnce();
    expect(onPreviewRestored).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('does not re-engage after the user exits Preview', async () => {
    const harness = createHarness();
    await flushEffects();
    harness.exitPreviewAsUser();

    harness.setRows([]);
    await flushEffects();
    harness.setRows([row()]);
    await flushEffects();

    expect(harness.engagePreview).not.toHaveBeenCalled();
    harness.dispose();
  });

  it('consumes a suspension when there is no room to restore', async () => {
    const harness = createHarness({ room: false });
    await flushEffects();

    harness.setRows([]);
    await flushEffects();
    harness.setRows([row()]);
    await flushEffects();

    expect(harness.engagePreview).not.toHaveBeenCalled();
    harness.dispose();
  });
});
