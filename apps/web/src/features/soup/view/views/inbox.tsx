import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import type {
  FacetSelection,
  SoupCollection,
  SoupRow,
} from '@app/features/soup/collection';
import { NIL_UUID } from '@app/features/soup/filters/facet-store';
import { useSoupView } from '@app/features/soup/view/context';
import { InboxListEntity } from '@app/features/soup/view/views/inbox/InboxListEntity';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import { ListEntity } from '@entity';
import Spinner from '@phosphor/spinner.svg';
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { getSelectedEntities } from '../../actions/list-action-state';
import { SoupFileDropzone } from '../components/actions/soup-file-dropzone';
import { SoupSelectionToolbar } from '../components/actions/soup-selection-toolbar';
import { SoupMobileControls } from '../components/mobile/soup-mobile-controls';
import { SoupEmptyState, SoupErrorState } from '../components/soup-empty-state';
import { SoupViewProvider } from '../context';
import { createSoupList } from '../primitives/create-soup-list';
import { useIsNewInbox } from '../primitives/use-is-new-inbox';
import { useSoupNotificationInvalidators } from '../primitives/use-soup-notification-invalidators';
import { SoupEntityList } from '../soup-entity-list';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../soup-entity-list-item';
import { SoupViewHeader } from '../soup-view-header';
import { SoupViewRoot } from '../soup-view-root';

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
  ...(isNewInbox ? { read_state: ['unread'] } : {}),
});

const applyInboxThreadScope = (
  collection: SoupCollection,
  isNewInbox: boolean,
  userId: string | undefined
) =>
  collection.facets.set('channel_thread_scope', [
    inboxThreadScope(isNewInbox, userId),
  ]);

const applyInboxMode = (
  collection: SoupCollection,
  isNewInbox: boolean,
  userId: string | undefined
) => {
  batch(() => {
    applyInboxThreadScope(collection, isNewInbox, userId);
    collection.facets.set('read_state', isNewInbox ? ['unread'] : []);
    collection.setState('groupBy', isNewInbox ? 'date' : undefined);
  });
};

function InboxListViewContent() {
  const { collection, sortVisible, viewName } = useSoupView();
  const isNewInbox = useIsNewInbox();
  const { dataSource, state: listState } = useList<SoupRow>();
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  useSplitDisplayName(viewName);
  useSoupNotificationInvalidators();
  onMount(() => root()?.focus());
  const selectedEntities = createMemo(() => getSelectedEntities(listState));

  return (
    <>
      <SoupFileDropzone>
        <SoupViewRoot
          ref={(element) => {
            setRoot(element);
            attachHotkeys(element);
          }}
          listScopeId={listScopeId}
        >
          <SoupViewHeader sortVisible={sortVisible()} />
          <SoupMobileControls />
          <div
            ref={setListContent}
            class="relative flex grow min-h-0 min-w-0 flex-col"
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
                      {(scope) => (
                        <Show
                          when={isNewInbox()}
                          fallback={
                            <ListEntity
                              entity={scope.item().entity}
                              highlighted={scope.highlighted()}
                              checked={scope.selected()}
                              showUnrollNotifications={
                                scope.item().entity.type !== 'email' &&
                                collection.facets.has('focus', 'inbox') &&
                                !collection.facets.has('focus', 'noise')
                              }
                              entityRowConfig={SOUP_MARK_DONE_ROW_CONFIG}
                              onChecked={scope.onChecked}
                              onClick={scope.onClick}
                              onProjectClick={scope.onProjectClick}
                              onContentHitClick={scope.onContentHitClick}
                            />
                          }
                        >
                          <InboxListEntity
                            entity={scope.item().entity}
                            highlighted={scope.highlighted()}
                            checked={scope.selected()}
                            entityRowConfig={SOUP_MARK_DONE_ROW_CONFIG}
                            onChecked={scope.onChecked}
                            onClick={scope.onClick}
                            onProjectClick={scope.onProjectClick}
                            onContentHitClick={scope.onContentHitClick}
                          />
                        </Show>
                      )}
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
                onClose={listState.selection.clear}
                onClear={() => {
                  listState.selection.clear();
                  root()?.focus();
                }}
              />
            </Show>
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
    </>
  );
}

export function InboxListView(props: InboxListViewProps) {
  const userId = useUserId();
  const isNewInbox = useIsNewInbox({ view: () => 'inbox' });
  const setup = createSoupList({
    view: 'inbox',
    initialState: {
      facets: createInitialInboxFacets(isNewInbox(), userId()),
    },
    disableLocalSearch: () => true,
  });

  let appliedMode = setup.collection.state.groupBy === 'date';
  createEffect(
    on([isNewInbox, userId], ([enabled, id]) => {
      if (enabled !== appliedMode) {
        applyInboxMode(setup.collection, enabled, id);
        appliedMode = enabled;
        return;
      }
      applyInboxThreadScope(setup.collection, enabled, id);
    })
  );

  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view="inbox"
        viewName={props.viewName ?? 'Inbox'}
      >
        <InboxListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}
