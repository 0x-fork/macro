import { createListState } from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import {
  createSoupCollection,
  type SoupCollectionInitialState,
  type SoupItem,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useUserId } from '@core/context/user';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import type { EntityData } from '@entity';
import { useIsTeamAdmin } from '@queries/team/teams';
import { type Accessor, createEffect } from 'solid-js';
import { createSoupCollectionPersistence } from '../soup-collection-persistence';
import { getViewPreset, type PresetContext } from '../soup-view-presets';
import { useIsNewInbox } from '../utils';

export type SoupViewSetupOptions = {
  view: ListView;
  initialState?: SoupCollectionInitialState;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  restoreCollection?: boolean;
};

/** Creates the shared Soup collection and generic List state for one view. */
export function useSoupViewSetup(options: SoupViewSetupOptions) {
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
    initialState: resolvedInitialState,
    additionalEntities: options.additionalEntities,
    disableLocalSearch: options.disableLocalSearch,
    persistence: createSoupCollectionPersistence({
      panel,
      view: options.view,
      restoreEntryState: options.restoreCollection,
      restorePreferences: initialState.sort === undefined,
    }),
  });

  createEffect(() => {
    const preset = getViewPreset(
      options.view,
      collection.state.activeTab,
      presetContext()
    );

    collection.facets.setExtraFacets([
      ...(preset?.facets ?? []),
      ...(initialState.extraFacets ?? []),
    ]);
    collection.setState('emailView', preset?.emailView);
  });

  const listState = createListState<SoupItem>({
    isNavigable: (item) => item.kind !== 'section-header',
    isSelectable: (item) => item.kind === 'entity',
    suppressFocus: () => isTouchDevice(),
  });

  return { collection, listState };
}
