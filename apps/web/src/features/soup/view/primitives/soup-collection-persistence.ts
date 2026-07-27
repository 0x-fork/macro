import type { ListView } from '@app/constants/list-views';
import type {
  FacetSelection,
  SoupCollectionStore,
  SoupEmailView,
} from '@app/features/soup/collection';
import { deserializeFacets } from '@app/features/soup/filtering/facet-store';
import type { SplitPanelContextType } from '@components/app/split-layout/context';
import type { EntryState } from '@components/app/split-layout/layoutManager';
import type {
  PersistedOptions,
  PersistenceStorage,
} from '@core/state/persistence';
import { z } from 'zod';

export const SOUP_COLLECTION_ENTRY_KEY = 'soup.collection';

/** Whether a split entry already owns collection state that must beat CRM defaults. */
export const hasSoupCollectionEntryState = (
  entryState: EntryState | undefined
): boolean =>
  entryState?.[SOUP_COLLECTION_ENTRY_KEY] !== undefined ||
  entryState?.['search.facets'] !== undefined ||
  entryState?.['search.filters'] !== undefined ||
  entryState?.['search.predicates'] !== undefined ||
  entryState?.['search.text'] !== undefined ||
  entryState?.['soup.sort'] !== undefined ||
  entryState?.['soup.groupBy'] !== undefined ||
  entryState?.['soup.collapsedGroups'] !== undefined ||
  entryState?.['soup.tab'] !== undefined;

const SORT_IDS = new Set([
  'updated_at',
  'created_at',
  'viewed_at',
  'priority',
  'status',
]);
const sortIdSchema = z.string().refine((id) => SORT_IDS.has(id));
const sortSchema = z
  .array(
    z.union([
      sortIdSchema.transform((id) => ({ id, reversed: false })),
      z.object({ id: sortIdSchema, reversed: z.boolean() }),
    ])
  )
  .transform((sort) => (sort.length > 0 ? sort : undefined));

const facetSelectionSchema = z.record(z.string(), z.array(z.string()));
const emailViewSchema = z.enum(['inbox', 'drafts', 'sent', 'all']);

const filterPreferenceSchema = z.object({
  version: z.literal(1),
  activeTab: z.string(),
  tabs: z.record(z.string(), facetSelectionSchema),
});

type SoupFilterPreference = z.infer<typeof filterPreferenceSchema>;

type PersistedTabDefaults = {
  groupBy?: string;
  emailView?: SoupEmailView;
};

const filterPreferenceKey = (view: ListView) =>
  `macro:pref:soup:${view}:filters:v1`;

const cloneFacetSelection = (selection: FacetSelection): FacetSelection =>
  Object.fromEntries(
    Object.keys(selection)
      .sort()
      .map((id) => [id, [...(selection[id] ?? [])]])
  );

const readSoupFilterPreference = (
  view: ListView
): SoupFilterPreference | undefined => {
  try {
    const raw = localStorage.getItem(filterPreferenceKey(view));
    if (!raw) return undefined;
    const result = filterPreferenceSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

const writeSoupFilterPreference = (
  view: ListView,
  preference: SoupFilterPreference
) => {
  try {
    localStorage.setItem(filterPreferenceKey(view), JSON.stringify(preference));
  } catch {
    // Collection state remains canonical when local storage is unavailable.
  }
};

export const readPersistedTabFacets = (
  view: ListView,
  tab: string
): FacetSelection | undefined => {
  const facets = readSoupFilterPreference(view)?.tabs[tab];
  return facets ? cloneFacetSelection(facets) : undefined;
};

const entryStateSchema = z.object({
  facets: facetSelectionSchema.optional(),
  sort: sortSchema.optional(),
  groupBy: z.string().nullable().optional(),
  collapsedGroups: z.array(z.string()).optional(),
  search: z.string().optional(),
  activeTab: z.string().nullable().optional(),
  emailView: emailViewSchema.nullable().optional(),
});

const legacyEntryStateSchema = z
  .object({
    'search.facets': facetSelectionSchema.optional(),
    'search.text': z.string().optional(),
    'soup.sort': sortSchema.optional(),
    'soup.groupBy': z.string().nullable().optional(),
    'soup.collapsedGroups': z.array(z.string()).optional(),
    'soup.tab': z.string().nullable().optional(),
  })
  .transform((state) => ({
    facets: state['search.facets'],
    sort: state['soup.sort'],
    groupBy: state['soup.groupBy'],
    collapsedGroups: state['soup.collapsedGroups'],
    search: state['search.text'],
    activeTab: state['soup.tab'],
  }))
  .refine((state) => Object.values(state).some((value) => value !== undefined));

type SoupCollectionEntryState = z.input<typeof entryStateSchema>;

type SoupCollectionPersistenceOptions = {
  panel: SplitPanelContextType;
  view: ListView;
  restoreEntryState?: boolean;
  restorePreferences?: boolean;
  restoreFilterPreferences?: boolean;
  resolveTabDefaults: (tab: string) => PersistedTabDefaults | undefined;
};

type SoupEntryStateStorageOptions<T> = {
  panel: SplitPanelContextType;
  key: string;
  restore: (current: T, state: EntryState, key: string) => T | undefined;
  write: (value: T) => unknown;
};

const soupEntryStateStorage = <T>({
  panel,
  key,
  restore,
  write,
}: SoupEntryStateStorageOptions<T>): PersistenceStorage<T> => {
  const entryState = panel.handle.currentEntryState();
  let captured: unknown;
  const dispose = panel.handle.registerEntryStateCaptor(key, () => captured);

  const update = (value: T) => {
    captured = write(value);
  };

  return {
    restore: (current) =>
      entryState ? restore(current, entryState, key) : undefined,
    initialize: update,
    write: update,
    dispose,
  };
};

const selectEntryState = (
  state: SoupCollectionStore
): SoupCollectionEntryState => ({
  facets: Object.fromEntries(
    Object.entries(state.facets).map(([id, optionIds]) => [id, [...optionIds]])
  ),
  sort: state.sort.map((item) => ({ ...item })),
  groupBy: state.groupBy ?? null,
  collapsedGroups: [...state.collapsedGroups],
  search: state.search,
  activeTab: state.activeTab ?? null,
  emailView: state.emailView ?? null,
});

const restoreEntrySlice = (
  current: SoupCollectionStore,
  raw: unknown
): SoupCollectionStore | undefined => {
  const result = entryStateSchema.safeParse(raw);
  if (!result.success) return undefined;

  const restored = result.data;
  const next = { ...current };

  if (restored.facets) {
    next.facets = deserializeFacets(restored.facets);
  }
  if (restored.sort) next.sort = restored.sort;
  if (restored.groupBy !== undefined) {
    next.groupBy = restored.groupBy ?? undefined;
  }
  if (restored.collapsedGroups) {
    next.collapsedGroups = restored.collapsedGroups;
  }
  if (restored.search !== undefined) next.search = restored.search;
  if (restored.activeTab !== undefined) {
    next.activeTab = restored.activeTab ?? undefined;
  }
  if (restored.emailView !== undefined) {
    next.emailView = restored.emailView ?? undefined;
  }

  return next;
};

const restoreLegacyEntrySlice = (
  current: SoupCollectionStore,
  raw: unknown
): SoupCollectionStore | undefined => {
  const result = legacyEntryStateSchema.safeParse(raw);
  return result.success ? restoreEntrySlice(current, result.data) : undefined;
};

const filterPreferenceStorage = (options: {
  view: ListView;
  restorePreference: boolean;
  resolveTabDefaults: (tab: string) => PersistedTabDefaults | undefined;
}): PersistenceStorage<SoupCollectionStore> => {
  let previous: string | undefined;
  const signature = (state: SoupCollectionStore) =>
    JSON.stringify({
      activeTab: state.activeTab,
      facets: cloneFacetSelection(state.facets),
    });

  return {
    restore: (current) => {
      if (!options.restorePreference) return undefined;

      const preference = readSoupFilterPreference(options.view);
      if (!preference) return undefined;

      const tab = preference.activeTab;
      const defaults = options.resolveTabDefaults(tab);
      const facets = preference.tabs[tab];
      if (!defaults || !facets) return undefined;

      return {
        ...current,
        facets: {
          ...cloneFacetSelection(facets),
          [options.view]: [tab],
          channel_thread_scope: [
            ...(facets.channel_thread_scope ??
              current.facets.channel_thread_scope ??
              []),
          ],
        },
        activeTab: tab,
        groupBy: defaults.groupBy,
        emailView: defaults.emailView,
      };
    },
    initialize: (current) => {
      previous = signature(current);
    },
    write: (current) => {
      const tab = current.activeTab;
      if (!tab) return;

      const serialized = signature(current);
      if (serialized === previous) return;
      previous = serialized;

      const existing = readSoupFilterPreference(options.view);
      writeSoupFilterPreference(options.view, {
        version: 1,
        activeTab: tab,
        tabs: {
          ...(existing?.tabs ?? {}),
          [tab]: cloneFacetSelection(current.facets),
        },
      });
    },
  };
};

const sortPreferenceStorage = (
  view: ListView,
  restorePreference: boolean
): PersistenceStorage<SoupCollectionStore> => {
  const key = `macro:pref:soup:${view}:sort`;
  let previous: string | undefined;

  return {
    restore: (current) => {
      if (!restorePreference) return undefined;
      try {
        const result = sortSchema.safeParse(
          JSON.parse(localStorage.getItem(key) ?? 'null')
        );
        return result.success && result.data
          ? { ...current, sort: result.data }
          : undefined;
      } catch {
        return undefined;
      }
    },
    initialize: (current) => {
      previous = JSON.stringify(current.sort.map((sort) => sort.id));
    },
    write: (current) => {
      // Keep the shared preference format compatible with production Soup.
      const serialized = JSON.stringify(current.sort.map((sort) => sort.id));
      if (serialized === previous) return;
      previous = serialized;
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // Collection state remains canonical when local storage is unavailable.
      }
    },
  };
};

export function createSoupCollectionPersistence(
  options: SoupCollectionPersistenceOptions
): PersistedOptions<SoupCollectionStore> {
  const preference = sortPreferenceStorage(
    options.view,
    options.restorePreferences ?? true
  );
  const filterPreference = filterPreferenceStorage({
    view: options.view,
    restorePreference: options.restoreFilterPreferences ?? true,
    resolveTabDefaults: options.resolveTabDefaults,
  });
  const entry = soupEntryStateStorage<SoupCollectionStore>({
    panel: options.panel,
    key: SOUP_COLLECTION_ENTRY_KEY,
    restore: (current, state, key) => {
      if (options.restoreEntryState === false) return undefined;
      return state[key] === undefined
        ? restoreLegacyEntrySlice(current, state)
        : restoreEntrySlice(current, state[key]);
    },
    write: selectEntryState,
  });

  return { storage: [preference, filterPreference, entry] };
}
