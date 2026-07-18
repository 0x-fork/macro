import { type Accessor, createEffect } from 'solid-js';
import { useSplitPanelOrThrow } from './layoutUtils';

/** Keeps the owning split's display name synchronized with a reactive label. */
export function useSplitDisplayName(name: Accessor<string>) {
  const panel = useSplitPanelOrThrow();
  createEffect(() => panel.handle.setDisplayName(name()));
}
