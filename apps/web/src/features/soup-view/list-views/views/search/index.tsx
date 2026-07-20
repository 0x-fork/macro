import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import {
  type FacetSelection,
  SoupCollectionProvider,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { Resize } from '@core/component/Resize';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import { ListEntity } from '@entity';
import Spinner from '@phosphor/spinner.svg';
import { cn } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import {
  SoupEmptyState,
  SoupSearchErrorState,
} from '../../../components/soup-empty-state';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../../../components/soup-entity-list-item';
import { SoupFileDropzone } from '../../../components/soup-file-dropzone';
import { SoupMobileControls } from '../../../components/soup-mobile-controls';
import { SoupPreviewPane } from '../../../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../../../components/soup-selection-toolbar';
import { SoupViewHeader } from '../../../components/soup-view-header';
import { SoupViewProvider, useSoupView } from '../../../context';
import { getViewPreset } from '../../../soup-view-presets';
import { useSoupNotificationInvalidators } from '../../../use-soup-notification-invalidators';
import { SoupEntityList } from '../../soup-entity-list';
import { SoupViewRoot } from '../../soup-view-root';
import { useSoupViewSetup } from '../../use-soup-view-setup';
import { registerSoupSearchSplit } from './search-controllers';
import { normalizeSearchFacets } from './search-facet-state';

export type SearchListViewProps = {
  viewName?: string;
  initialFacets?: FacetSelection;
  initialSearchText?: string;
};

function SearchProgress(props: { label: string }) {
  return (
    <div class="flex items-center gap-2 p-3 text-xs text-text-muted">
      <Spinner class="size-3 animate-spin" />
      {props.label}
    </div>
  );
}

function SearchListViewContent() {
  const collection = useSoupCollection();
  const { dataSource, state: listState } = useList<SoupItem>();
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  useSplitDisplayName(view.viewName);
  useSoupNotificationInvalidators();
  onMount(() => root()?.focus());
  createEffect(() => {
    const visible = view.previewPaneVisible();
    const [current, setCurrent] = panel.previewState;
    if (current() !== visible) setCurrent(visible);
  });
  onCleanup(() => panel.previewState[1](false));

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
        collection.setState('search', query);
      },
      focus: () => view.openSearch(),
    });
    onCleanup(teardown);
  });

  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          view.previewVisible() ? { side: 'left', percentage: 30 } : undefined,
      }}
    >
      <SoupFileDropzone>
        <SoupViewRoot
          ref={(element) => {
            setRoot(element);
            attachHotkeys(element);
          }}
          listScopeId={listScopeId}
        >
          <SoupViewHeader />
          <SoupMobileControls />

          <div class="relative grow min-h-0 min-w-0 flex max-sm:flex-col">
            <Resize.Zone direction="horizontal" gutter={0}>
              <Resize.Panel
                id="soup-list"
                minSize={300}
                maxSize={view.previewPaneVisible() ? 440 : undefined}
              >
                <div
                  ref={setListContent}
                  class={cn(
                    'relative flex size-full min-h-0 min-w-0 flex-col',
                    view.previewPaneVisible() && 'border-r border-edge-muted'
                  )}
                >
                  <List.Content>
                    <List.Items>
                      <SoupEntityList
                        view="search"
                        root={root}
                        listScopeId={listScopeId}
                        viewportRef={setViewport}
                        trailing={
                          <Show
                            when={
                              dataSource.isLoadingMore() ||
                              dataSource.isFetching()
                            }
                          >
                            <SearchProgress
                              label={
                                dataSource.isLoadingMore()
                                  ? 'Loading more...'
                                  : 'Searching...'
                              }
                            />
                          </Show>
                        }
                      >
                        {(item) => (
                          <SoupEntityListItem item={item}>
                            {(scope) => (
                              <ListEntity
                                entity={scope.item().entity}
                                highlighted={scope.highlighted()}
                                checked={scope.selected()}
                                entityRowConfig={SOUP_MARK_DONE_ROW_CONFIG}
                                onChecked={scope.onChecked}
                                onClick={scope.onClick}
                                onProjectClick={scope.onProjectClick}
                                onContentHitClick={scope.onContentHitClick}
                              />
                            )}
                          </SoupEntityListItem>
                        )}
                      </SoupEntityList>
                    </List.Items>
                    <List.Error>
                      {() => (
                        <div class="size-full min-h-0">
                          <SoupSearchErrorState />
                        </div>
                      )}
                    </List.Error>
                    <List.Loading>
                      <div class="flex size-full min-h-0 flex-col mobile:pt-(--mobile-content-inset-top) mobile:pb-(--mobile-content-inset-bottom)">
                        <LoadingBlock />
                      </div>
                    </List.Loading>
                    <List.Empty>
                      <Show
                        when={dataSource.isFetching()}
                        fallback={
                          <div class="size-full min-h-0">
                            <SoupEmptyState />
                          </div>
                        }
                      >
                        <SearchProgress label="Searching..." />
                      </Show>
                    </List.Empty>
                  </List.Content>

                  <CustomScrollbar scrollContainer={viewport} />
                  <PullToRefresh
                    scrollContainer={() =>
                      dataSource.items().length > 0 ? viewport() : listContent()
                    }
                    onRefresh={dataSource.refresh}
                  />
                  <Show when={selectedEntities().length > 0}>
                    <SoupSelectionToolbar
                      selected={selectedEntities()}
                      onClear={() => {
                        listState.selection.clear();
                        root()?.focus();
                      }}
                    />
                  </Show>
                </div>
              </Resize.Panel>

              <SoupPreviewPane root={root} />
            </Resize.Zone>
          </div>
        </SoupViewRoot>
      </SoupFileDropzone>

      <Suspense>
        <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
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
