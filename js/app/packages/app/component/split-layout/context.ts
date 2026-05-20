import type { NullableSize } from '@solid-primitives/resize-observer';
import {
  type Accessor,
  createContext,
  type JSX,
  type Setter,
  type Signal,
} from 'solid-js';
import type { SplitHandle, SplitManager } from './layoutManager';

export type CollapsibleRegistration = {
  id: string;
  priority: number; // lower = higher priority to collapse first
  collapsed: Accessor<boolean>;
  setCollapsed: Setter<boolean>;
  ref: Accessor<HTMLElement | null | undefined>; // uncollapsed element — measured before collapse
  collapsedRef?: Accessor<HTMLElement | null | undefined>; // collapsed element — measured while collapsed
};

export type CollapsibleItemInput = Omit<
  CollapsibleRegistration,
  'collapsed' | 'setCollapsed'
> & {
  onCollapsedChange?: (isCollapsed: boolean) => void;
};

export type HeaderCollapser = {
  register: (reg: CollapsibleRegistration) => () => void; // returns cleanup
};

export const SplitLayoutContext = createContext<{
  manager: SplitManager;
}>();

export type HalfSplitState = {
  percentage: number;
  side: 'left' | 'right';
};

export type SplitPanelContextType = {
  handle: SplitHandle;
  splitHotkeyScope: string;
  isPanelActive: Accessor<boolean>;
  panelRef: Accessor<HTMLElement | null>;
  panelSize: NullableSize;
  contentOffsetTop: Accessor<number>;
  setContentOffsetTop: Setter<number>;
  halfSplitState?: Accessor<HalfSplitState | undefined>;
  previewState: Signal<boolean>;
  /**
   * Slot for the preview pane's content. Consumers (e.g. soup-view) set a
   * factory function returning the JSX they want rendered inside the preview
   * Resize.Panel that lives in <SplitPanel>. Wrapped in a thunk so the JSX is
   * not materialized until <SplitPanel> actually mounts the preview slot.
   */
  previewContent: Signal<(() => JSX.Element) | undefined>;
  layoutRefs: {
    headerLeft?: HTMLDivElement;
    headerRight?: HTMLDivElement;
    toolbarLeft?: HTMLDivElement;
    toolbarRight?: HTMLDivElement;
    /**
     * Preview-pane toolbar slots. Only assigned while the preview
     * Resize.Panel is mounted (i.e. previewState is true). They render in the
     * same toolbar row as toolbarLeft/Right but inside the preview Resize.Panel
     * so widths align with the body split.
     */
    previewToolbarLeft?: HTMLDivElement;
    previewToolbarRight?: HTMLDivElement;
  };
  headerCollapser: HeaderCollapser;
};

export const SplitPanelContext = createContext<SplitPanelContextType>();
