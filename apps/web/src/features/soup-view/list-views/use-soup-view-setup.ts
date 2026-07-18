import { createListState } from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import {
  createSoupCollection,
  type SoupCollectionInitialState,
  type SoupItem,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { usePreference } from '@app/preferences/use-preference';
import { useUserId } from '@core/context/user';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { useIsTeamAdmin } from '@queries/team/teams';
import { createEffect, on } from 'solid-js';
import { getViewPreset, type PresetContext } from '../soup-view-presets';
import { useIsNewInbox } from '../utils';

export type SoupViewSetupOptions = {
  view: ListView;
  initialState?: SoupCollectionInitialState;
};

/** Creates the shared Soup collection and generic List state for one view. */
export function useSoupViewSetup(options: SoupViewSetupOptions) {
  const userId = useUserId();
  const isTeamAdmin = useIsTeamAdmin();
  const isNewInbox = useIsNewInbox({ view: () => options.view });
  const presetContext = (): PresetContext => ({
    userId: userId(),
    isTeamAdmin: isTeamAdmin(),
    isNewInbox: isNewInbox(),
  });
  const [sortPreference, setSortPreference] = usePreference<string[]>(
    `macro:pref:soup:${options.view}:sort`,
    { default: [] }
  );
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
    sortIds:
      initialState.sortIds ??
      (sortPreference().length > 0 ? sortPreference() : undefined),
    activeTab: initialTab,
  };

  const collection = createSoupCollection({
    initialState: resolvedInitialState,
  });

  createEffect(() => {
    const preset = getViewPreset(
      options.view,
      collection.activeTab(),
      presetContext()
    );
    collection.facets.setExtraFacets([
      ...(preset?.facets ?? []),
      ...(initialState.extraFacets ?? []),
    ]);
    collection.setEmailView(preset?.emailView);
  });
  createEffect(
    on(() => collection.sort().map((sort) => sort.id), setSortPreference, {
      defer: true,
    })
  );

  const listState = createListState<SoupItem>({
    isNavigable: (item) => item.kind !== 'section-header',
    isSelectable: (item) => item.kind === 'entity',
    suppressFocus: () => isTouchDevice(),
  });

  return { collection, listState };
}
