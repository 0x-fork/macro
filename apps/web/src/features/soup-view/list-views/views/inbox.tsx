import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { InboxListEntity } from '@app/features/next-soup/soup-view/views/inbox/InboxListEntity';
import {
  type FacetSelection,
  type SoupCollection,
  SoupCollectionProvider,
  type SoupItem,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { Resize } from '@core/component/Resize';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import { ListEntity } from '@entity';
import Spinner from '@phosphor/spinner.svg';
import { EmptyStatePanel } from '@ui';
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
  SoupErrorState,
} from '../../components/soup-empty-state';
import { SoupEntityListItem } from '../../components/soup-entity-list-item';
import { SoupFileDropzone } from '../../components/soup-file-dropzone';
import { SoupMobileControls } from '../../components/soup-mobile-controls';
import { SoupPreviewPane } from '../../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../../components/soup-selection-toolbar';
import { SoupViewHeader } from '../../components/soup-view-header';
import { SoupViewProvider, useSoupView } from '../../context';
import { useSoupNotificationInvalidators } from '../../use-soup-notification-invalidators';
import { useIsNewInbox } from '../../utils';
import { SoupEntityList } from '../soup-entity-list';
import { SoupViewRoot } from '../soup-view-root';
import { useSoupViewSetup } from '../use-soup-view-setup';

export type InboxListViewProps = {
  viewName?: string;
};

const inboxThreadScope = (isNewInbox: boolean, userId: string | undefined) =>
  isNewInbox ? (userId ?? NIL_UUID) : NIL_UUID;

const createInitialInboxFacets = (
  isNewInbox: boolean,
  userId: string | undefined
): FacetSelection => ({
  channel_thread_scope: [inboxThreadScope(isNewInbox, userId)],
  ...(isNewInbox ? { read_state: ['unread'], call_status: ['MISSED'] } : {}),
});

const syncInboxFacets = (
  collection: SoupCollection,
  isNewInbox: boolean,
  userId: string | undefined
) => {
  collection.facets.set('channel_thread_scope', [
    inboxThreadScope(isNewInbox, userId),
  ]);
  if (isNewInbox) collection.facets.set('call_status', ['MISSED']);
};

function InboxListViewContent() {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  const isNewInbox = useIsNewInbox();
  const { dataSource, state: listState } = useList<SoupItem>();
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

  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );

  const previewEmpty = (
    <EmptyStatePanel
      graphic={EmptyStatePreviewIcon}
      title="Nothing selected"
      description="Select an item from your inbox to preview it here."
      centered
    />
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
                  class="relative flex size-full min-h-0 min-w-0 flex-col"
                >
                  <List.Content>
                    <List.Items>
                      <SoupEntityList
                      view="inbox"
                      root={root}
                      listScopeId={listScopeId}
                      viewportRef={setViewport}
                      autoFocusFirstEntity={() => !isNewInbox()}
                    >
                      {(item) => (
                        <SoupEntityListItem
                          item={item}
                          hoverFocus={() => !isNewInbox()}
                        >
                          {(row) =>
                            isNewInbox() ? (
                              <InboxListEntity {...row} />
                            ) : (
                              <ListEntity {...row} />
                            )
                          }
                        </SoupEntityListItem>
                      )}
                      </SoupEntityList>
                    </List.Items>
                    <List.Error>
                      {() => (
                        <div class="size-full min-h-0">
                          <SoupErrorState />
                        </div>
                      )}
                    </List.Error>
                    <List.Loading>
                      <div class="flex size-full items-center justify-center">
                        <Spinner class="size-4 animate-spin" />
                      </div>
                    </List.Loading>
                    <List.Empty>
                      <div class="size-full min-h-0">
                        <SoupEmptyState />
                      </div>
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
              <SoupPreviewPane
                root={root}
                targetPercent={isNewInbox() ? 55 : 70}
                empty={isNewInbox() ? previewEmpty : undefined}
              />
            </Resize.Zone>
          </div>
        </SoupViewRoot>
      </SoupFileDropzone>

      <Suspense>
        <Show
          when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile() && !isNewInbox()}
        >
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
}

export function InboxListView(props: InboxListViewProps) {
  const userId = useUserId();
  const isNewInbox = useIsNewInbox({ view: () => 'inbox' });
  const setup = useSoupViewSetup({
    view: 'inbox',
    initialState: {
      facets: createInitialInboxFacets(isNewInbox(), userId()),
    },
  });

  createEffect(() => syncInboxFacets(setup.collection, isNewInbox(), userId()));

  return (
    <SoupCollectionProvider value={setup.collection}>
      <List.Root
        dataSource={setup.collection.dataSource}
        state={setup.listState}
      >
        <SoupViewProvider view="inbox" viewName={props.viewName ?? 'Inbox'}>
          <InboxListViewContent />
        </SoupViewProvider>
      </List.Root>
    </SoupCollectionProvider>
  );
}
