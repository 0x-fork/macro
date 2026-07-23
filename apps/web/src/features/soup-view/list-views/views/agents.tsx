import { List, useList } from '@app/components/list';
import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { runCreateAction } from '@app/features/command/Launcher';
import type { SoupRow } from '@app/features/soup-list';
import { useSoupView } from '@app/features/soup-view/context';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { Resize } from '@core/component/Resize';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import EmptyStateAutomationsGraphic from '@design/empty-state-automations.svg';
import { ListEntity } from '@entity';
import PlusIcon from '@phosphor/plus.svg';
import Spinner from '@phosphor/spinner.svg';
import { useAutomationEntities } from '@queries/agent-schedule/entities';
import { EmptyStatePanel } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { SoupErrorState } from '../../components/soup-empty-state';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../../components/soup-entity-list-item';
import { SoupFileDropzone } from '../../components/soup-file-dropzone';
import { SoupMobileControls } from '../../components/soup-mobile-controls';
import { SoupPreviewPane } from '../../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../../components/soup-selection-toolbar';
import { SoupViewHeader } from '../../components/soup-view-header';
import { SoupViewProvider } from '../../context';
import { useSoupNotificationInvalidators } from '../../use-soup-notification-invalidators';
import { createSoupList } from '../create-soup-list';
import { SoupEntityList } from '../soup-entity-list';
import { SoupViewRoot } from '../soup-view-root';

export type AgentsListViewProps = {
  viewName?: string;
};

function AgentsEmptyState() {
  const { collection } = useSoupView();

  return (
    <Switch>
      <Match when={collection.state.activeTab === 'automations'}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateAutomationsGraphic}
          title="No automations to show"
          description="Automations run in the background to handle repetitive work for you — like triaging messages, updating tasks, or sending follow-ups."
          primaryAction={{
            label: 'New automation',
            icon: PlusIcon,
            onClick: () => runCreateAction('automation'),
          }}
          documentationUrl={LIST_VIEW_DOCS_URL.agents}
        />
      </Match>
      <Match when>
        <EmptyStatePanel
          centered
          graphic={EmptyStateAiGraphic}
          title="Get started with agents"
          description="Create an agent, or use Macro with your favorite AI client via MCP."
          primaryAction={{
            label: 'New agent',
            icon: PlusIcon,
            onClick: () => runCreateAction('chat'),
          }}
          documentationUrl={LIST_VIEW_DOCS_URL.agents}
        />
      </Match>
    </Switch>
  );
}

function AgentsListViewContent() {
  const panel = useSplitPanelOrThrow();
  const { previewPaneVisible, previewVisible, viewName } = useSoupView();
  const { dataSource, state: listState } = useList<SoupRow>();
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [listContent, setListContent] = createSignal<HTMLDivElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  useSplitDisplayName(viewName);
  useSoupNotificationInvalidators();
  onMount(() => root()?.focus());
  createEffect(() => {
    const visible = previewPaneVisible();
    const [current, setCurrent] = panel.previewState;
    if (current() !== visible) setCurrent(visible);
  });
  onCleanup(() => panel.previewState[1](false));

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
          previewVisible() ? { side: 'left', percentage: 30 } : undefined,
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
                maxSize={previewPaneVisible() ? 440 : undefined}
              >
                <div
                  ref={setListContent}
                  class="relative flex size-full min-h-0 min-w-0 flex-col"
                >
                  <List.Content>
                    <List.Items>
                      <SoupEntityList
                        view="agents"
                        root={root}
                        listScopeId={listScopeId}
                        viewportRef={setViewport}
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
                        <AgentsEmptyState />
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

export function AgentsListView(props: AgentsListViewProps) {
  const automationEntities = useAutomationEntities();
  const setup = createSoupList({
    view: 'agents',
    additionalEntities: automationEntities,
  });

  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view="agents"
        viewName={props.viewName ?? 'Agents'}
      >
        <AgentsListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}
