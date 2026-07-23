import { List, useList } from '@app/components/list';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import type { SoupRow } from '@app/features/soup-list';
import { PullToRefresh } from '@components/app/mobile/PullToRefresh';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useSplitDisplayName } from '@components/app/split-layout/use-split-display-name';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
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
import { SoupEmptyState, SoupErrorState } from '../components/soup-empty-state';
import {
  SOUP_MARK_DONE_ROW_CONFIG,
  SoupEntityListItem,
} from '../components/soup-entity-list-item';
import { SoupFileDropzone } from '../components/soup-file-dropzone';
import { SoupMobileControls } from '../components/soup-mobile-controls';
import { SoupPreviewPane } from '../components/soup-preview-pane';
import { SoupSelectionToolbar } from '../components/soup-selection-toolbar';
import { SoupViewHeader } from '../components/soup-view-header';
import { SoupViewProvider, useSoupView } from '../context';
import { useSoupNotificationInvalidators } from '../use-soup-notification-invalidators';
import { createSoupList } from './create-soup-list';
import { SoupEntityList } from './soup-entity-list';
import { SoupViewRoot } from './soup-view-root';

export type DefaultListViewId = 'calls' | 'channels' | 'folders' | 'mail';

export type DefaultListViewProps = {
  view: DefaultListViewId;
  viewName: string;
};

export function DefaultListView(props: DefaultListViewProps) {
  return <SoupViewImplementation {...props} />;
}

function createDefaultSoupList(props: DefaultListViewProps) {
  return createSoupList({ view: props.view });
}

/** Compatibility entry while concrete views migrate to their own provider roots. */
export function SoupViewImplementation(props: DefaultListViewProps) {
  const setup = createDefaultSoupList(props);
  return (
    <List.Root state={setup.list}>
      <SoupViewProvider
        soup={setup}
        view={props.view}
        viewName={props.viewName}
      >
        <DefaultListViewContent />
      </SoupViewProvider>
    </List.Root>
  );
}

export function DefaultListViewContent() {
  const panel = useSplitPanelOrThrow();
  const { previewPaneVisible, previewVisible, view, viewName } = useSoupView();
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
                  class={cn(
                    'relative flex size-full min-h-0 min-w-0 flex-col',
                    previewPaneVisible() && 'border-r border-edge-muted'
                  )}
                >
                  <List.Content>
                    <List.Items>
                      <SoupEntityList
                        view={view()}
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
