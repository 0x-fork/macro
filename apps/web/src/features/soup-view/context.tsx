import type { ListView } from '@app/constants/list-views';
import {
  type TabbedListView,
  VIEW_TAB_LISTS,
} from '@app/features/next-soup/soup-view/soup-view-tabs';
import {
  type FacetSelection,
  useSoupCollection,
} from '@app/features/soup-list';
import type { SplitPanelContextType } from '@components/app/split-layout/context';
import { createSplitBreakpoints } from '@components/app/split-layout/create-split-breakpoints';
import type { EntryState } from '@components/app/split-layout/layoutManager';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useUserId } from '@core/context/user';
import { isMobile } from '@core/mobile/isMobile';
import {
  makePersistedState,
  type PersistenceStorage,
} from '@core/state/persistence';
import type { EntityData } from '@entity';
import { useIsTeamAdmin } from '@queries/team/teams';
import {
  type Accessor,
  batch,
  createContext,
  createRenderEffect,
  createSignal,
  type JSX,
  type ParentProps,
  type Setter,
  useContext,
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { z } from 'zod';

import {
  getViewPreset,
  type PresetContext,
  VIEW_TAB_PRESETS,
} from './soup-view-presets';
import { showSoupSort, useIsNewInbox } from './utils';

const WIDE_SPLIT_PANEL_BREAKPOINT = 640;
const SOUP_VIEW_STATE_ENTRY_KEY = 'soup.viewState';

export type SoupViewMode = 'list' | 'board';
type SoupViewState = {
  viewMode: SoupViewMode;
  previewEntityId: string | undefined;
  previewOpen: boolean;
};

const persistedStateSchema = z.object({
  viewMode: z.enum(['list', 'board']).optional(),
  previewEntityId: z.string().optional(),
  previewOpen: z.boolean().optional(),
});

const legacyStateSchema = z
  .object({
    'soup.viewMode': z.enum(['list', 'board']).optional(),
    'soup.preview': z.string().optional(),
    'soup.previewOpen': z.boolean().optional(),
  })
  .transform((state) => ({
    viewMode: state['soup.viewMode'],
    previewEntityId: state['soup.preview'],
    previewOpen: state['soup.previewOpen'],
  }))
  .refine((state) => Object.values(state).some((value) => value !== undefined));

const parseSoupViewState = (entryState: EntryState | undefined) => {
  if (!entryState) return undefined;
  const canonical = entryState[SOUP_VIEW_STATE_ENTRY_KEY];
  const parsed =
    canonical !== undefined
      ? persistedStateSchema.safeParse(canonical)
      : legacyStateSchema.safeParse(entryState);
  return parsed.success ? parsed.data : undefined;
};

const restoreSoupViewState = (
  current: SoupViewState,
  entryState: EntryState | undefined,
  restoreViewMode: boolean
): SoupViewState | undefined => {
  const restored = parseSoupViewState(entryState);
  if (!restored) return undefined;
  return {
    viewMode:
      restoreViewMode && restored.viewMode
        ? restored.viewMode
        : current.viewMode,
    previewEntityId: restored.previewEntityId,
    previewOpen:
      restored.previewOpen ??
      (restored.previewEntityId !== undefined ? true : current.previewOpen),
  };
};

const createSoupViewStateStorage = (
  panel: SplitPanelContextType,
  restoreViewMode: boolean
): PersistenceStorage<SoupViewState> => {
  const entryState = panel.handle.currentEntryState();
  let captured: SoupViewState;
  const dispose = panel.handle.registerEntryStateCaptor(
    SOUP_VIEW_STATE_ENTRY_KEY,
    () => captured
  );
  const update = (state: SoupViewState) => {
    captured = { ...state };
  };

  return {
    restore: (current) =>
      restoreSoupViewState(current, entryState, restoreViewMode),
    initialize: update,
    write: update,
    dispose,
  };
};

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
  isTabAvailable: (tabId: string) => boolean;
  applyTabPreset: (tabId: string) => boolean;
  activePresetFacets: Accessor<FacetSelection>;

  viewMode: Accessor<SoupViewMode>;
  setViewMode: Setter<SoupViewMode>;

  previewEntity: Accessor<EntityData | undefined>;
  previewEntityId: Accessor<string | undefined>;
  setPreviewEntity: (
    next:
      | EntityData
      | undefined
      | ((previous: EntityData | undefined) => EntityData | undefined)
  ) => EntityData | undefined;
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
  if (!collection.state.activeTab && defaultTab()) {
    collection.setState('activeTab', defaultTab());
  }

  const activePresetFacets = () =>
    getViewPreset(
      props.view,
      collection.state.activeTab ?? defaultTab(),
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

  const isTabAvailable = (tabId: string) =>
    getViewPreset(props.view, tabId, presetContext()) !== undefined;

  const applyTabPreset = (tabId: string) => {
    const preset = getViewPreset(props.view, tabId, presetContext());
    if (!preset) return false;

    const currentPreset = getViewPreset(
      props.view,
      collection.state.activeTab ?? defaultTab(),
      presetContext()
    );

    batch(() => {
      replacePresetFacets(
        currentPreset?.initialFacets ?? {},
        preset.initialFacets ?? {}
      );
      collection.facets.setExtraFacets(preset.facets ?? []);
      collection.setState({
        activeTab: tabId,
        emailView: preset.emailView,
        groupBy: preset.groupBy,
        collapsedGroups: [],
      });
    });

    return true;
  };

  const breakpoints = createSplitBreakpoints({
    wide: WIDE_SPLIT_PANEL_BREAKPOINT,
  });

  const restoredViewState = parseSoupViewState(
    panel.handle.currentEntryState()
  );
  const hasPersistedPreviewState =
    restoredViewState?.previewOpen !== undefined ||
    restoredViewState?.previewEntityId !== undefined;
  const stateStorage = createSoupViewStateStorage(
    panel,
    props.initialViewMode === undefined
  );
  let previewDefaultResolved =
    props.initialPreviewOpen !== undefined || hasPersistedPreviewState;
  const [state, setState] = makePersistedState(
    createStore<SoupViewState>({
      viewMode:
        props.initialViewMode ??
        (props.view === 'companies' ? 'board' : 'list'),
      previewEntityId: undefined,
      previewOpen: props.initialPreviewOpen ?? false,
    }),
    { storage: stateStorage }
  );

  const viewMode = () => state.viewMode;
  const setViewMode: Setter<SoupViewMode> = (next) => {
    const value = typeof next === 'function' ? next(state.viewMode) : next;
    setState('viewMode', value);
    return value;
  };

  const [previewEntity, setPreviewEntitySignal] = createSignal<EntityData>();

  const previewEntityId = () => state.previewEntityId;

  const setPreviewEntity = (
    next:
      | EntityData
      | undefined
      | ((previous: EntityData | undefined) => EntityData | undefined)
  ) => {
    const entity = typeof next === 'function' ? next(previewEntity()) : next;
    setPreviewEntitySignal(() => entity);
    setState('previewEntityId', entity?.id);
    return entity;
  };

  const previewOpen = () => state.previewOpen;

  const setPreviewOpen: Setter<boolean> = (next) => {
    const value = typeof next === 'function' ? next(state.previewOpen) : next;
    setState('previewOpen', value);
    return value;
  };

  createRenderEffect(() => {
    if (previewDefaultResolved || !isNewInbox()) return;
    previewDefaultResolved = true;
    setPreviewOpen(true);
  });

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
    isTabAvailable,
    applyTabPreset,
    activePresetFacets,

    viewMode,
    setViewMode,

    previewEntity,
    previewEntityId,
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
