import type { ListView } from '@app/constants/list-views';
import {
  type TabbedListView,
  VIEW_TAB_LISTS,
} from '@app/features/next-soup/soup-view/soup-view-tabs';
import type {
  FacetSelection,
  SoupCollection,
  SoupCollectionStore,
} from '@app/features/soup/collection';
import type { SplitPanelContextType } from '@components/app/split-layout/context';
import type { EntryState } from '@components/app/split-layout/layoutManager';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useUserId } from '@core/context/user';
import { isModality } from '@core/mobile/inputModality';
import {
  makePersistedState,
  type PersistenceStorage,
} from '@core/state/persistence';
import { useIsTeamAdmin } from '@queries/team/teams';
import {
  type Accessor,
  batch,
  createContext,
  createMemo,
  createSignal,
  type JSX,
  type ParentProps,
  type Setter,
  useContext,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { z } from 'zod';

import type { SoupList } from './list/create-soup-list';
import { readPersistedTabFacets } from './soup-collection-persistence';
import {
  getViewPreset,
  type PresetContext,
  VIEW_TAB_PRESETS,
} from './soup-view-presets';
import { showSoupSort, useIsNewInbox } from './utils';

const SOUP_VIEW_STATE_ENTRY_KEY = 'soup.viewState';

export type SoupViewMode = 'list' | 'board';
type SoupViewState = {
  viewMode: SoupViewMode;
};

const persistedStateSchema = z.object({
  viewMode: z.enum(['list', 'board']).optional(),
});

const legacyStateSchema = z
  .object({
    'soup.viewMode': z.enum(['list', 'board']).optional(),
  })
  .transform((state) => ({
    viewMode: state['soup.viewMode'],
  }))
  .refine((state) => state.viewMode !== undefined);

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

export type SoupEntityCollapse = (entityId: string) => Promise<void>;

export type SoupViewContextValue = {
  collection: SoupCollection;
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

  searchControl: Accessor<SoupSearchControl | undefined>;
  setSearchControl: Setter<SoupSearchControl | undefined>;
  searchOpen: Accessor<boolean>;
  setSearchOpen: Setter<boolean>;
  focusSearch: (selectAll?: boolean) => void;
  openSearch: (selectAll?: boolean) => void;

  sortOpen: Accessor<boolean>;
  setSortOpen: Setter<boolean>;
  sortVisible: Accessor<boolean>;

  collapseEntity: {
    callback: Accessor<SoupEntityCollapse | undefined>;
    set: Setter<SoupEntityCollapse | undefined>;
    shouldCollapse: Accessor<boolean>;
  };
};

const SoupViewContext = createContext<SoupViewContextValue>();

export function SoupViewProvider(
  props: ParentProps<{
    soup: SoupList;
    view: ListView;
    viewName: string;
    newInboxOverride?: boolean;
    initialViewMode?: SoupViewMode;
  }>
) {
  const collection = props.soup.collection;
  const panel = useSplitPanelOrThrow();

  const userId = useUserId();

  const isTeamAdmin = useIsTeamAdmin();

  const isNewInbox = useIsNewInbox({
    view: () => props.view,
    override: () => props.newInboxOverride,
  });

  const presetContext = createMemo(
    (): PresetContext => ({
      userId: userId(),
      isTeamAdmin: isTeamAdmin(),
      isNewInbox: isNewInbox(),
    })
  );

  const tabbedView = (): TabbedListView | undefined =>
    props.view in VIEW_TAB_LISTS ? (props.view as TabbedListView) : undefined;

  const tabs = () => {
    const view = tabbedView();
    return view ? VIEW_TAB_LISTS[view] : [];
  };

  const defaultTab = createMemo(() => VIEW_TAB_PRESETS[props.view]?.default);

  if (!collection.state.activeTab && defaultTab()) {
    collection.setState('activeTab', defaultTab());
  }

  const activePresetFacets = createMemo(
    () =>
      getViewPreset(
        props.view,
        collection.state.activeTab ?? defaultTab(),
        presetContext()
      )?.initialFacets ?? {}
  );

  const replacePresetFacets = (
    selection: FacetSelection,
    previous: FacetSelection,
    next: FacetSelection
  ) => {
    const facetIds = new Set([...Object.keys(previous), ...Object.keys(next)]);

    for (const facetId of facetIds) {
      const remove = new Set(previous[facetId] ?? []);
      const retained = (selection[facetId] ?? []).filter(
        (id) => !remove.has(id)
      );
      const optionIds = [
        ...retained,
        ...(next[facetId] ?? []).filter((id) => !retained.includes(id)),
      ];

      if (optionIds.length === 0) {
        delete selection[facetId];
        continue;
      }
      selection[facetId] = optionIds;
    }
  };

  const isTabAvailable = (tabId: string) =>
    getViewPreset(props.view, tabId, presetContext()) !== undefined;

  const applyTabPreset = (tabId: string) => {
    if (collection.state.activeTab === tabId) return true;

    const preset = getViewPreset(props.view, tabId, presetContext());
    if (!preset) return false;

    const currentPreset = getViewPreset(
      props.view,
      collection.state.activeTab ?? defaultTab(),
      presetContext()
    );
    const persistedFacets = readPersistedTabFacets(props.view, tabId);

    batch(() => {
      collection.facets.setExtraFacets(preset.facets ?? []);
      collection.setState(
        produce((state: SoupCollectionStore) => {
          if (persistedFacets) {
            state.facets = {
              ...persistedFacets,
              [props.view]: [tabId],
              channel_thread_scope: [
                ...(persistedFacets.channel_thread_scope ??
                  state.facets.channel_thread_scope ??
                  []),
              ],
            };
          } else {
            replacePresetFacets(
              state.facets,
              currentPreset?.initialFacets ?? {},
              preset.initialFacets ?? {}
            );
          }
          state.activeTab = tabId;
          state.emailView = preset.emailView;
          state.groupBy = preset.groupBy;
        })
      );
    });

    return true;
  };

  const stateStorage = createSoupViewStateStorage(
    panel,
    props.initialViewMode === undefined
  );

  const [state, setState] = makePersistedState(
    createStore<SoupViewState>({
      viewMode:
        props.initialViewMode ??
        (props.view === 'companies' ? 'board' : 'list'),
    }),
    { storage: stateStorage }
  );

  const viewMode = () => state.viewMode;

  const setViewMode: Setter<SoupViewMode> = (next) => {
    const value = typeof next === 'function' ? next(state.viewMode) : next;
    setState('viewMode', value);
    return value;
  };

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

  const [collapseEntityCallback, setCollapseEntityCallback] = createSignal<
    SoupEntityCollapse | undefined
  >();
  const shouldCollapseEntity = () =>
    collapseEntityCallback() !== undefined &&
    isModality('touch') &&
    (collection.facets.has('focus', 'inbox') ||
      collection.facets.has('focus', 'noise') ||
      collection.facets.has('status', 'not-done'));

  const value = {
    collection,
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

    searchControl,
    setSearchControl,
    searchOpen,
    setSearchOpen,
    focusSearch,
    openSearch,

    sortOpen,
    setSortOpen,
    sortVisible: () => showSoupSort(props.view, isNewInbox()),

    collapseEntity: {
      callback: collapseEntityCallback,
      set: setCollapseEntityCallback,
      shouldCollapse: shouldCollapseEntity,
    },
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
