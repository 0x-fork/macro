import type { ListView } from '@app/constants/list-views';
import { useSoup } from '@app/features/next-soup/soup-context';
import {
  createSoupCollection,
  isSoupRowVisible,
  type SoupCollectionInitialState,
  type SoupRow,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useUserId } from '@core/context/user';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import type { EntityData } from '@entity';
import { useIsTeamAdmin } from '@queries/team/teams';
import type { Accessor } from 'solid-js';
import { createSoupCollectionPersistence } from '../soup-collection-persistence';
import { getViewPreset, type PresetContext } from '../soup-view-presets';
import { useIsNewInbox } from '../utils';

export type CreateSoupListOptions = {
  view: ListView;
  initialState?: SoupCollectionInitialState;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  restoreCollection?: boolean;
};

/** Configures the split-owned Soup List for one collection-backed view. */
export function createSoupList(options: CreateSoupListOptions) {
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();
  const userId = useUserId();
  const isTeamAdmin = useIsTeamAdmin();
  const isNewInbox = useIsNewInbox({ view: () => options.view });

  const presetContext = (): PresetContext => ({
    userId: userId(),
    isTeamAdmin: isTeamAdmin(),
    isNewInbox: isNewInbox(),
  });

  const initialState = options.initialState ?? {};
  const initialPreset =
    getViewPreset(options.view, initialState.activeTab, presetContext()) ??
    getViewPreset(options.view, undefined, presetContext());
  const initialTab = initialPreset?.initialFacets?.[options.view]?.[0];

  const resolvedInitialState: SoupCollectionInitialState = {
    groupBy: initialPreset?.groupBy,
    emailView: initialPreset?.emailView,
    ...initialState,
    facets: {
      ...(initialPreset?.initialFacets ?? {}),
      ...(initialState.facets ?? {}),
      ...(initialTab ? { [options.view]: [initialTab] } : {}),
      channel_thread_scope: initialState.facets?.channel_thread_scope ?? [
        NIL_UUID,
      ],
    },
    extraFacets: [
      ...(initialPreset?.facets ?? []),
      ...(initialState.extraFacets ?? []),
    ],
    sort: initialState.sort,
    activeTab: initialTab,
  };
  const collection = createSoupCollection({
    view: options.view,
    initialState: resolvedInitialState,
    additionalEntities: options.additionalEntities,
    disableLocalSearch: options.disableLocalSearch,
    limit: () => (options.view === 'mail' ? 30 : 100),
    persistence: createSoupCollectionPersistence({
      panel,
      view: options.view,
      restoreEntryState: options.restoreCollection,
      restorePreferences: initialState.sort === undefined,
    }),
  });

  const isVisible = (row: SoupRow) =>
    isSoupRowVisible(row, collection.collapsedGroups.isExpanded);

  soup.configure({
    dataSource: collection.dataSource,
    isNavigable: (row) => row.kind !== 'section-header' && isVisible(row),
    isSelectable: (row) => row.kind === 'entity' && isVisible(row),
    suppressFocus: () => isTouchDevice(),
  });

  return { collection, list: soup.list };
}

export type SoupList = ReturnType<typeof createSoupList>;
