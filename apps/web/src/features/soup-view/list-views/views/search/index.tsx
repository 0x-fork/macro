import { List } from '@app/components/list';
import {
  type FacetSelection,
  SoupCollectionProvider,
  useSoupCollection,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { onCleanup, onMount } from 'solid-js';
import { SoupViewProvider, useSoupView } from '../../../context';
import { getViewPreset } from '../../../soup-view-presets';
import { DefaultListViewContent } from '../../default-list-view';
import { useSoupViewSetup } from '../../use-soup-view-setup';
import { registerSoupSearchSplit } from './search-controllers';
import { normalizeSearchFacets } from './search-facet-state';

export type SearchListViewProps = {
  viewName?: string;
  initialFacets?: FacetSelection;
  initialSearchText?: string;
};

function SearchListViewContent() {
  const collection = useSoupCollection();
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  onMount(() => {
    const teardown = registerSoupSearchSplit(panel.handle.id, {
      applyFacetOverrides: ({ query, facets }) => {
        const preset = getViewPreset('search');
        collection.facets.hydrate({
          ...(preset?.initialFacets ?? {}),
          ...facets,
          channel_thread_scope: [NIL_UUID],
        });
        normalizeSearchFacets(collection.facets);
        collection.setSearch(query);
      },
      focus: () => view.openSearch(),
    });
    onCleanup(teardown);
  });
  return <DefaultListViewContent />;
}

export function SearchListView(props: SearchListViewProps) {
  const setup = useSoupViewSetup({
    view: 'search',
    initialState: {
      facets: props.initialFacets,
      search: props.initialSearchText,
    },
  });

  return (
    <SoupCollectionProvider value={setup.collection}>
      <List.Root
        dataSource={setup.collection.dataSource}
        state={setup.listState}
      >
        <SoupViewProvider view="search" viewName={props.viewName ?? 'Search'}>
          <SearchListViewContent />
        </SoupViewProvider>
      </List.Root>
    </SoupCollectionProvider>
  );
}
