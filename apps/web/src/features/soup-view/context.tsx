import type { ListView } from '@app/constants/list-views';
import {
  type TabbedListView,
  VIEW_TAB_LISTS,
} from '@app/features/next-soup/soup-view/soup-view-tabs';
import {
  type FacetSelection,
  useSoupCollection,
} from '@app/features/soup-list';
import { createSplitBreakpoints } from '@components/app/split-layout/create-split-breakpoints';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useUserId } from '@core/context/user';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityData } from '@entity';
import { useIsTeamAdmin } from '@queries/team/teams';
import {
  type Accessor,
  batch,
  createContext,
  createSignal,
  type JSX,
  type ParentProps,
  type Setter,
  useContext,
} from 'solid-js';

import {
  getViewPreset,
  type PresetContext,
  VIEW_TAB_PRESETS,
} from './soup-view-presets';
import { showSoupSort, useIsNewInbox } from './utils';

const WIDE_SPLIT_PANEL_BREAKPOINT = 640;

export type SoupViewMode = 'list' | 'board';
export type SoupViewTab = { value: string; label: JSX.Element };
export type SoupSearchControl = {
  focus: (selectAll?: boolean) => void;
};

export type SoupViewContextValue = {
  view: Accessor<ListView>;
  viewName: Accessor<string>;
  newInboxOverride: Accessor<boolean | undefined>;

  tabs: Accessor<SoupViewTab[]>;
  defaultTab: Accessor<string | undefined>;
  applyTabPreset: (tabId: string) => boolean;
  activePresetFacets: Accessor<FacetSelection>;

  viewMode: Accessor<SoupViewMode>;
  setViewMode: Setter<SoupViewMode>;

  previewEntity: Accessor<EntityData | undefined>;
  setPreviewEntity: Setter<EntityData | undefined>;
  previewOpen: Accessor<boolean>;
  setPreviewOpen: Setter<boolean>;
  previewPaneVisible: Accessor<boolean>;
  previewVisible: Accessor<boolean>;

  searchControl: Accessor<SoupSearchControl | undefined>;
  setSearchControl: Setter<SoupSearchControl | undefined>;
  searchOpen: Accessor<boolean>;
  setSearchOpen: Setter<boolean>;
  focusSearch: (selectAll?: boolean) => void;
  openSearch: (selectAll?: boolean) => void;

  sortOpen: Accessor<boolean>;
  setSortOpen: Setter<boolean>;
  sortVisible: Accessor<boolean>;
};

const SoupViewContext = createContext<SoupViewContextValue>();

export function SoupViewProvider(
  props: ParentProps<{
    view: ListView;
    viewName: string;
    newInboxOverride?: boolean;
    initialViewMode?: SoupViewMode;
    initialPreviewOpen?: boolean;
  }>
) {
  const collection = useSoupCollection();
  const panel = useSplitPanelOrThrow();

  const userId = useUserId();
  const isTeamAdmin = useIsTeamAdmin();
  const isNewInbox = useIsNewInbox({
    view: () => props.view,
    override: () => props.newInboxOverride,
  });
  const presetContext = (): PresetContext => ({
    userId: userId(),
    isTeamAdmin: isTeamAdmin(),
    isNewInbox: isNewInbox(),
  });

  const tabbedView = (): TabbedListView | undefined =>
    props.view in VIEW_TAB_LISTS ? (props.view as TabbedListView) : undefined;
  const tabs = () => {
    const view = tabbedView();
    return view ? VIEW_TAB_LISTS[view] : [];
  };

  const defaultTab = () => VIEW_TAB_PRESETS[props.view]?.default;
  if (!collection.activeTab() && defaultTab()) {
    collection.setActiveTab(defaultTab());
  }

  const activePresetFacets = () =>
    getViewPreset(
      props.view,
      collection.activeTab() ?? defaultTab(),
      presetContext()
    )?.initialFacets ?? {};

  const replacePresetFacets = (
    previous: FacetSelection,
    next: FacetSelection
  ) => {
    const facetIds = new Set([...Object.keys(previous), ...Object.keys(next)]);

    for (const facetId of facetIds) {
      const remove = new Set(previous[facetId] ?? []);
      const retained = collection.facets
        .getSelected(facetId)
        .filter((id) => !remove.has(id));

      collection.facets.set(facetId, [
        ...retained,
        ...(next[facetId] ?? []).filter((id) => !retained.includes(id)),
      ]);
    }
  };

  const applyTabPreset = (tabId: string) => {
    const preset = getViewPreset(props.view, tabId, presetContext());
    if (!preset) return false;

    const currentPreset = getViewPreset(
      props.view,
      collection.activeTab() ?? defaultTab(),
      presetContext()
    );

    batch(() => {
      replacePresetFacets(
        currentPreset?.initialFacets ?? {},
        preset.initialFacets ?? {}
      );
      collection.facets.setExtraFacets(preset.facets ?? []);
      collection.setActiveTab(tabId);
      collection.setEmailView(preset.emailView);
      collection.setGroupBy(preset.groupBy);
      collection.disclosure.expandAll();
    });

    return true;
  };

  const breakpoints = createSplitBreakpoints({
    wide: WIDE_SPLIT_PANEL_BREAKPOINT,
  });
  const entryState = panel.handle.currentEntryState();
  const persistedPreviewEntity = entryState?.['soup.preview'];
  const persistedPreviewOpen = entryState?.['soup.previewOpen'];

  const [viewMode, setViewMode] = createSignal(
    props.initialViewMode ?? (props.view === 'companies' ? 'board' : 'list')
  );
  const [previewEntity, setPreviewEntity] = createSignal<EntityData>();

  const [previewOpen, setPreviewOpen] = createSignal(
    typeof persistedPreviewOpen === 'boolean'
      ? persistedPreviewOpen
      : (props.initialPreviewOpen ??
          (typeof persistedPreviewEntity === 'string' || isNewInbox()))
  );

  const hasPreviewableEntity = () =>
    collection.dataSource.items().some((item) => item.kind === 'entity');
  const previewPaneVisible = () =>
    !isMobile() &&
    breakpoints.wide() &&
    previewOpen() &&
    hasPreviewableEntity();
  const previewVisible = () =>
    previewPaneVisible() && previewEntity() !== undefined;

  const [searchControl, setSearchControl] = createSignal<SoupSearchControl>();
  const [searchOpen, setSearchOpen] = createSignal(false);
  const focusSearch = (selectAll = false) => {
    queueMicrotask(() => searchControl()?.focus(selectAll));
  };
  const openSearch = (selectAll = false) => {
    setSearchOpen(true);
    focusSearch(selectAll);
  };

  const [sortOpen, setSortOpen] = createSignal(false);

  const value = {
    view: () => props.view,
    viewName: () => props.viewName,
    newInboxOverride: () => props.newInboxOverride,

    tabs,
    defaultTab,
    applyTabPreset,
    activePresetFacets,

    viewMode,
    setViewMode,

    previewEntity,
    setPreviewEntity,
    previewOpen,
    setPreviewOpen,
    previewPaneVisible,
    previewVisible,

    searchControl,
    setSearchControl,
    searchOpen,
    setSearchOpen,
    focusSearch,
    openSearch,

    sortOpen,
    setSortOpen,
    sortVisible: () => showSoupSort(props.view, isNewInbox()),
  } satisfies SoupViewContextValue;

  return (
    <SoupViewContext.Provider value={value}>
      {props.children}
    </SoupViewContext.Provider>
  );
}

export const useMaybeSoupView = () => useContext(SoupViewContext);

export function useSoupView() {
  const context = useMaybeSoupView();
  if (!context) {
    throw new Error('useSoupView must be used inside SoupViewProvider');
  }
  return context;
}
