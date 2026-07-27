import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import type { SoupRow } from '@app/features/soup/collection';
import { TaskListEntity } from '@app/features/soup/view/views/tasks/TaskListEntity';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import Spinner from '@phosphor/spinner.svg';
import { createMemo, createSignal, onMount, Show, Suspense } from 'solid-js';
import { getSelectedEntities } from '../../actions/list-action-state';
import { SoupFileDropzone } from '../components/actions/soup-file-dropzone';
import { SoupSelectionToolbar } from '../components/actions/soup-selection-toolbar';
import { SoupMobileControls } from '../components/mobile/soup-mobile-controls';
import { SoupEmptyState, SoupErrorState } from '../components/soup-empty-state';
import { SoupViewProvider, useSoupView } from '../context';
import { createSoupList } from '../primitives/create-soup-list';
import { useSoupNotificationInvalidators } from '../primitives/use-soup-notification-invalidators';
import { SoupEntityList } from '../soup-entity-list';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../soup-entity-list-item';
import { SoupViewHeader } from '../soup-view-header';
import { SoupViewRoot } from '../soup-view-root';

export type TasksListViewProps = {
  viewName?: string;
};

function TasksListViewContent() {
  const { sortVisible, viewName } = useSoupView();
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
                  view="tasks"
                  root={root}
                  listScopeId={listScopeId}
                  viewportRef={setViewport}
                >
                  {(item) => (
                    <SoupEntityListItem item={item}>
                      {(scope) => (
                        <TaskListEntity
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
        <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
          <SoupChatInput />
        </Show>
      </Suspense>
    </>
  );
}

export function TasksListView(props: TasksListViewProps) {
  const setup = createSoupList({ view: 'tasks' });

  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view="tasks"
        viewName={props.viewName ?? 'Tasks'}
      >
        <TasksListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}
